import "server-only";

import { randomUUID } from "node:crypto";

import { getStellarConfig } from "@/lib/stellar/config";
import { getServerEnv } from "@/server/env";
import { syncEvents } from "@/server/events/service";
import {
  FirestoreOperationalStateStore,
  type OperationalStateStore,
} from "@/server/operations/operational-state-store";
import {
  TtlMaintenanceService,
  type TtlMaintenanceResult,
} from "@/server/operations/ttl-maintenance-service";
import type { EventSyncResult } from "@/server/events/event-sync-service";

const OPERATIONS_LEASE_MS = 15 * 60 * 1_000;
const OPERATION_ATTEMPTS = 3;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function retryOperation<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= OPERATION_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < OPERATION_ATTEMPTS) await delay(attempt * 500);
    }
  }
  throw lastError;
}

export type ScheduledOperationsResult =
  | { skipped: true; reason: "already_running" }
  | {
      skipped: false;
      events: EventSyncResult;
      ttl: TtlMaintenanceResult;
    };

export class ScheduledOperationsService {
  constructor(
    private readonly store: OperationalStateStore,
    private readonly eventSync: () => Promise<EventSyncResult>,
    private readonly ttlMaintenance: () => Promise<TtlMaintenanceResult>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(): Promise<ScheduledOperationsResult> {
    const ownerId = randomUUID();
    const leaseId = "scheduled-operations";
    const acquired = await this.store.tryAcquireLease(
      leaseId,
      ownerId,
      this.now(),
      OPERATIONS_LEASE_MS,
    );
    if (!acquired) return { skipped: true, reason: "already_running" };

    try {
      const events = await retryOperation(this.eventSync);
      const ttl = await retryOperation(this.ttlMaintenance);
      return { skipped: false, events, ttl };
    } finally {
      await this.store.releaseLease(leaseId, ownerId);
    }
  }
}

let scheduledOperationsService: ScheduledOperationsService | undefined;

export function getScheduledOperationsService(): ScheduledOperationsService {
  if (!scheduledOperationsService) {
    const config = getStellarConfig();
    const env = getServerEnv();
    scheduledOperationsService = new ScheduledOperationsService(
      new FirestoreOperationalStateStore(),
      syncEvents,
      () => new TtlMaintenanceService(
        config,
        env.STELLAR_REVIEW_SPONSOR_SECRET,
      ).maintain(),
    );
  }
  return scheduledOperationsService;
}
