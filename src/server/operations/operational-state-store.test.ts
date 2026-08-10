// @vitest-environment node

import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { FirestoreOperationalStateStore } from "@/server/operations/operational-state-store";

interface MemoryReference {
  id: string;
  get(): Promise<MemorySnapshot>;
}

interface MemorySnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

function createFirestore(): Firestore {
  const documents = new Map<string, Record<string, unknown>>();
  const reference = (id: string): MemoryReference => ({
    id,
    async get() {
      const value = documents.get(id);
      return { exists: value !== undefined, data: () => value };
    },
  });
  return {
    collection: () => ({ doc: reference }),
    runTransaction: async (worker: (transaction: unknown) => Promise<unknown>) => worker({
      get: (ref: MemoryReference) => ref.get(),
      set: (ref: MemoryReference, value: Record<string, unknown>) => {
        documents.set(ref.id, value);
      },
      delete: (ref: MemoryReference) => {
        documents.delete(ref.id);
      },
    }),
  } as unknown as Firestore;
}

describe("FirestoreOperationalStateStore", () => {
  it("advances cursors monotonically and enforces lease ownership", async () => {
    const store = new FirestoreOperationalStateStore(createFirestore());
    const now = new Date("2026-08-11T00:00:00.000Z");
    await store.advanceEventCursor("events-contract", 200, now);
    await store.advanceEventCursor("events-contract", 150, now);
    await expect(store.readEventCursor("events-contract")).resolves.toMatchObject({
      nextLedger: 200,
    });

    await expect(store.tryAcquireLease("lease", "owner-a", now, 1_000)).resolves.toBe(true);
    await expect(store.tryAcquireLease("lease", "owner-b", now, 1_000)).resolves.toBe(false);
    await store.releaseLease("lease", "owner-b");
    await expect(
      store.tryAcquireLease("lease", "owner-b", new Date(now.getTime() + 1_001), 1_000),
    ).resolves.toBe(true);
  });

  it("increments all rate-limit windows atomically and reports the reset delay", async () => {
    const store = new FirestoreOperationalStateStore(createFirestore());
    const now = new Date("2026-08-11T00:00:00.000Z");
    const rules = [
      { id: "wallet-budget", limit: 2, windowMs: 60_000 },
      { id: "global-budget", limit: 100, windowMs: 60_000 },
    ];

    await expect(store.consumeRateLimits(rules, now)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    await expect(store.consumeRateLimits(rules, now)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    await expect(store.consumeRateLimits(rules, now)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    await expect(
      store.consumeRateLimits(rules, new Date(now.getTime() + 60_001)),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
  });
});
