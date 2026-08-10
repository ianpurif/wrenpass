// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type { OperationalStateStore } from "@/server/operations/operational-state-store";
import { ScheduledOperationsService } from "@/server/operations/operations-service";

function createStore(acquired = true): OperationalStateStore {
  return {
    readEventCursor: vi.fn(async () => null),
    advanceEventCursor: vi.fn(async () => undefined),
    tryAcquireLease: vi.fn(async () => acquired),
    releaseLease: vi.fn(async () => undefined),
    consumeRateLimits: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
  };
}

const eventResult = {
  indexed: 1,
  duplicates: 0,
  notificationsSent: 1,
  notificationFailures: 0,
  checkpointAdvanced: true,
  retentionGap: false,
};
const ttlResult = {
  entriesInspected: 12,
  minimumRemainingLedgers: 300_000,
  entriesExtended: 0,
  transactionsSubmitted: 0,
};

describe("ScheduledOperationsService", () => {
  it("runs event recovery before TTL maintenance and releases its lease", async () => {
    const store = createStore();
    const calls: string[] = [];
    const service = new ScheduledOperationsService(
      store,
      vi.fn(async () => {
        calls.push("events");
        return eventResult;
      }),
      vi.fn(async () => {
        calls.push("ttl");
        return ttlResult;
      }),
      () => new Date("2026-08-11T00:00:00.000Z"),
    );

    await expect(service.run()).resolves.toEqual({
      skipped: false,
      events: eventResult,
      ttl: ttlResult,
    });
    expect(calls).toEqual(["events", "ttl"]);
    expect(store.releaseLease).toHaveBeenCalledTimes(1);
  });

  it("returns a successful no-op when another invocation owns the lease", async () => {
    const store = createStore(false);
    const eventSync = vi.fn();
    const ttlMaintenance = vi.fn();
    const service = new ScheduledOperationsService(store, eventSync, ttlMaintenance);

    await expect(service.run()).resolves.toEqual({
      skipped: true,
      reason: "already_running",
    });
    expect(eventSync).not.toHaveBeenCalled();
    expect(ttlMaintenance).not.toHaveBeenCalled();
  });

  it("releases the lease when an operation fails", async () => {
    const store = createStore();
    const failure = new Error("RPC unavailable");
    const service = new ScheduledOperationsService(
      store,
      vi.fn(async () => { throw failure; }),
      vi.fn(),
    );

    await expect(service.run()).rejects.toBe(failure);
    expect(store.releaseLease).toHaveBeenCalledTimes(1);
  });

  it("recovers from a temporary provider failure inside one scheduled run", async () => {
    const store = createStore();
    const eventSync = vi.fn()
      .mockRejectedValueOnce(new Error("temporary RPC failure"))
      .mockResolvedValue(eventResult);
    const service = new ScheduledOperationsService(
      store,
      eventSync,
      vi.fn().mockResolvedValue(ttlResult),
    );

    await expect(service.run()).resolves.toMatchObject({ skipped: false });
    expect(eventSync).toHaveBeenCalledTimes(2);
  });
});
