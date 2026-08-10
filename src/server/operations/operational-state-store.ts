import "server-only";

import type { Firestore, Transaction } from "firebase-admin/firestore";

import { getFirestoreDb } from "@/server/firestore/firebase-admin";
import {
  eventSyncCursorSchema,
  operationLeaseSchema,
  operationalStateSchema,
  rateLimitWindowSchema,
  type EventSyncCursor,
} from "@/server/models";

const COLLECTION = "operational_state";

export interface RateLimitRule {
  id: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface OperationalStateStore {
  readEventCursor(id: string): Promise<EventSyncCursor | null>;
  advanceEventCursor(id: string, nextLedger: number, now: Date): Promise<void>;
  tryAcquireLease(id: string, ownerId: string, now: Date, durationMs: number): Promise<boolean>;
  releaseLease(id: string, ownerId: string): Promise<void>;
  consumeRateLimits(rules: RateLimitRule[], now: Date): Promise<RateLimitDecision>;
}

function readData(transaction: Transaction, db: Firestore, id: string) {
  return transaction.get(db.collection(COLLECTION).doc(id));
}

export class FirestoreOperationalStateStore implements OperationalStateStore {
  constructor(private readonly db: Firestore = getFirestoreDb()) {}

  async readEventCursor(id: string): Promise<EventSyncCursor | null> {
    const snapshot = await this.db.collection(COLLECTION).doc(id).get();
    if (!snapshot.exists) return null;
    const state = operationalStateSchema.parse(snapshot.data());
    return state.kind === "event_sync_cursor" ? state : null;
  }

  async advanceEventCursor(id: string, nextLedger: number, now: Date): Promise<void> {
    const candidate = eventSyncCursorSchema.parse({
      id,
      kind: "event_sync_cursor",
      nextLedger,
      updatedAt: now.toISOString(),
    });
    await this.db.runTransaction(async (transaction) => {
      const reference = this.db.collection(COLLECTION).doc(id);
      const snapshot = await transaction.get(reference);
      if (snapshot.exists) {
        const current = operationalStateSchema.parse(snapshot.data());
        if (current.kind !== "event_sync_cursor") {
          throw new Error(`Operational state ${id} is not an event cursor.`);
        }
        if (current.nextLedger >= candidate.nextLedger) return;
      }
      transaction.set(reference, candidate);
    });
  }

  async tryAcquireLease(
    id: string,
    ownerId: string,
    now: Date,
    durationMs: number,
  ): Promise<boolean> {
    const lease = operationLeaseSchema.parse({
      id,
      kind: "operation_lease",
      ownerId,
      expiresAt: new Date(now.getTime() + durationMs).toISOString(),
      updatedAt: now.toISOString(),
    });
    return this.db.runTransaction(async (transaction) => {
      const reference = this.db.collection(COLLECTION).doc(id);
      const snapshot = await transaction.get(reference);
      if (snapshot.exists) {
        const current = operationalStateSchema.parse(snapshot.data());
        if (
          current.kind !== "operation_lease" ||
          new Date(current.expiresAt).getTime() > now.getTime()
        ) {
          return false;
        }
      }
      transaction.set(reference, lease);
      return true;
    });
  }

  async releaseLease(id: string, ownerId: string): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const reference = this.db.collection(COLLECTION).doc(id);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return;
      const current = operationalStateSchema.parse(snapshot.data());
      if (current.kind === "operation_lease" && current.ownerId === ownerId) {
        transaction.delete(reference);
      }
    });
  }

  async consumeRateLimits(
    rules: RateLimitRule[],
    now: Date,
  ): Promise<RateLimitDecision> {
    if (rules.length === 0) return { allowed: true, retryAfterSeconds: 0 };
    return this.db.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(
        rules.map((rule) => readData(transaction, this.db, rule.id)),
      );
      const windows = rules.map((rule, index) => {
        const snapshot = snapshots[index];
        if (!snapshot?.exists) return null;
        const current = operationalStateSchema.parse(snapshot.data());
        if (current.kind !== "rate_limit_window") {
          throw new Error(`Operational state ${rule.id} is not a rate-limit window.`);
        }
        return current;
      });

      let retryAfterSeconds = 0;
      for (const [index, rule] of rules.entries()) {
        const window = windows[index];
        if (!window) continue;
        const resetAt = new Date(window.windowStartedAt).getTime() + rule.windowMs;
        if (resetAt > now.getTime() && window.count >= rule.limit) {
          retryAfterSeconds = Math.max(
            retryAfterSeconds,
            Math.max(1, Math.ceil((resetAt - now.getTime()) / 1_000)),
          );
        }
      }
      if (retryAfterSeconds > 0) return { allowed: false, retryAfterSeconds };

      for (const [index, rule] of rules.entries()) {
        const current = windows[index];
        const stillActive = current
          && new Date(current.windowStartedAt).getTime() + rule.windowMs > now.getTime();
        const next = rateLimitWindowSchema.parse({
          id: rule.id,
          kind: "rate_limit_window",
          count: stillActive ? current.count + 1 : 1,
          windowStartedAt: stillActive ? current.windowStartedAt : now.toISOString(),
          updatedAt: now.toISOString(),
        });
        transaction.set(this.db.collection(COLLECTION).doc(rule.id), next);
      }
      return { allowed: true, retryAfterSeconds: 0 };
    });
  }
}
