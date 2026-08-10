import { describe, expect, it, vi } from "vitest";

import {
  isStaleLedgerHealthError,
  resolveRetainedEventRange,
  retryStartLedgerFromRangeError,
} from "@/server/stellar/event-retention";

type RetentionReader = Parameters<typeof resolveRetainedEventRange>[0];

describe("resolveRetainedEventRange", () => {
  it("uses the health retention window when the RPC node is healthy", async () => {
    const reader = {
      getHealth: vi.fn().mockResolvedValue({
        status: "healthy",
        latestLedger: 10_000,
        ledgerRetentionWindow: 5_000,
        oldestLedger: 5_001,
      }),
      getLatestLedger: vi.fn(),
      getEvents: vi.fn(),
    } as unknown as RetentionReader;

    await expect(resolveRetainedEventRange(reader, [])).resolves.toEqual({
      startLedger: 5_101,
      endLedger: 10_000,
    });
    expect(reader.getLatestLedger).not.toHaveBeenCalled();
    expect(reader.getEvents).not.toHaveBeenCalled();
  });

  it("probes retained event metadata when getHealth rejects a briefly stale ledger", async () => {
    const filters = [{ type: "contract" as const, contractIds: ["CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"] }];
    const reader = {
      getHealth: vi.fn().mockRejectedValue({
        code: -32603,
        message: "[-32603] latency (33s) since last known ledger closed is too high (>30s)",
      }),
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 10_000 }),
      getEvents: vi.fn().mockResolvedValue({ oldestLedger: 4_000, latestLedger: 10_000 }),
    } as unknown as RetentionReader;

    await expect(resolveRetainedEventRange(reader, filters)).resolves.toEqual({
      startLedger: 4_100,
      endLedger: 10_000,
    });
    expect(reader.getEvents).toHaveBeenCalledWith({
      startLedger: 10_000,
      filters,
      limit: 1,
    });
  });

  it("does not hide unrelated RPC failures", async () => {
    const failure = new Error("RPC credentials are invalid.");
    const reader = {
      getHealth: vi.fn().mockRejectedValue(failure),
      getLatestLedger: vi.fn(),
      getEvents: vi.fn(),
    } as unknown as RetentionReader;

    await expect(resolveRetainedEventRange(reader, [])).rejects.toBe(failure);
  });

  it("retries the retention probe when a load-balanced backend is behind", async () => {
    const reader = {
      getHealth: vi.fn().mockRejectedValue({
        message: "latency (33s) since last known ledger closed is too high (>30s)",
      }),
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 10_010 }),
      getEvents: vi
        .fn()
        .mockRejectedValueOnce(
          new Error("startLedger must be within the ledger range: 4000 - 10000"),
        )
        .mockResolvedValueOnce({ oldestLedger: 4_000, latestLedger: 10_000 }),
    } as unknown as RetentionReader;

    await expect(resolveRetainedEventRange(reader, [])).resolves.toEqual({
      startLedger: 4_100,
      endLedger: 10_010,
    });
    expect(reader.getEvents).toHaveBeenNthCalledWith(2, {
      startLedger: 4_100,
      filters: [],
      limit: 1,
    });
  });
});

describe("isStaleLedgerHealthError", () => {
  it("recognizes the plain JSON-RPC error returned by Stellar Testnet", () => {
    expect(isStaleLedgerHealthError({
      code: -32603,
      message: "[-32603] latency (33s) since last known ledger closed is too high (>30s)",
    })).toBe(true);
  });
});

describe("retryStartLedgerFromRangeError", () => {
  it("moves inside the exact retained range reported by the responding RPC node", () => {
    expect(retryStartLedgerFromRangeError(
      new Error("startLedger must be within the ledger range: 3942698 - 4063657"),
    )).toBe(3_942_798);
  });

  it("ignores unrelated failures", () => {
    expect(retryStartLedgerFromRangeError(new Error("fetch failed"))).toBeNull();
  });
});
