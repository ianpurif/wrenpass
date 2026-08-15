import { nativeToScVal, rpc, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  decodeCustomerActivity,
  readEventPages,
  readOwnedPasses,
} from "@/server/stellar/customer-chain-reader";
import { testCustomerAddress, testRecipientAddress } from "@/test/fixtures/customer";

function mapValue(values: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    Object.entries(values).map(
      ([key, value]) =>
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val: value }),
    ),
  );
}

function event(
  name: string,
  actor: string,
  value: xdr.ScVal,
  id: string,
): rpc.Api.EventResponse {
  return {
    id,
    type: "contract",
    ledger: 100,
    ledgerClosedAt: "2026-08-09T08:00:00.000Z",
    transactionIndex: 1,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: "a".repeat(64),
    topic: [
      xdr.ScVal.scvSymbol(name),
      nativeToScVal(BigInt(1), { type: "u64" }),
      nativeToScVal(BigInt(2), { type: "u64" }),
      nativeToScVal(actor, { type: "address" }),
    ],
    value,
  };
}

describe("decodeCustomerActivity", () => {
  it("decodes purchases and outgoing gifts for the authenticated wallet", () => {
    const events = [
      event(
        "pass_purchased",
        testCustomerAddress,
        mapValue({ total: nativeToScVal(BigInt(50_000_000), { type: "i128" }) }),
        "purchase",
      ),
      event(
        "pass_gifted",
        testCustomerAddress,
        mapValue({ recipient: nativeToScVal(testRecipientAddress, { type: "address" }) }),
        "gift",
      ),
    ];

    expect(decodeCustomerActivity(events, testCustomerAddress)).toEqual([
      expect.objectContaining({ id: "purchase", kind: "Purchased", amount: "50000000" }),
      expect.objectContaining({ id: "gift", kind: "Gifted", counterparty: testRecipientAddress }),
    ]);
  });

  it("classifies a gift to the wallet as received", () => {
    const events = [
      event(
        "pass_gifted",
        testRecipientAddress,
        mapValue({ recipient: nativeToScVal(testCustomerAddress, { type: "address" }) }),
        "received",
      ),
    ];

    expect(decodeCustomerActivity(events, testCustomerAddress)).toEqual([
      expect.objectContaining({ id: "received", kind: "Received", counterparty: testRecipientAddress }),
    ]);
  });

  it("decodes redemption and refund lifecycle events for the owner", () => {
    const events = [
      event("pass_redeemed", testCustomerAddress, mapValue({}), "redeemed"),
      event("pass_refunded", testCustomerAddress, mapValue({}), "refunded"),
    ];

    expect(decodeCustomerActivity(events, testCustomerAddress)).toEqual([
      expect.objectContaining({ id: "redeemed", kind: "Redeemed" }),
      expect.objectContaining({ id: "refunded", kind: "Refunded" }),
    ]);
  });
});

describe("readEventPages", () => {
  it("retries inside the retained range reported by a different RPC backend", async () => {
    const getEvents = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("startLedger must be within the ledger range: 3942698 - 4063657"),
      )
      .mockResolvedValueOnce({
        events: [],
        oldestLedgerCloseTime: "2026-08-01T00:00:00Z",
      });

    await expect(
      readEventPages(
        { getEvents },
        { startLedger: 3_942_690, endLedger: 3_943_000, filters: [], limit: 10_000 },
      ),
    ).resolves.toEqual({
      events: [],
      oldestLedgerCloseTime: "2026-08-01T00:00:00Z",
    });
    expect(getEvents).toHaveBeenNthCalledWith(2, {
      startLedger: 3_942_798,
      endLedger: 3_943_001,
      filters: [],
      limit: 10_000,
    });
  });

  it("continues across empty RPC scan pages and deduplicates boundary events", async () => {
    const purchased = event(
      "pass_purchased",
      testCustomerAddress,
      mapValue({ total: nativeToScVal(BigInt(50_000_000), { type: "i128" }) }),
      "purchase",
    );
    const getEvents = vi
      .fn()
      .mockResolvedValueOnce({
        events: [purchased],
        oldestLedgerCloseTime: "2026-08-01T00:00:00Z",
      })
      .mockResolvedValueOnce({
        events: [purchased],
        oldestLedgerCloseTime: "2026-08-01T00:00:00Z",
      });

    await expect(
      readEventPages(
        { getEvents },
        { startLedger: 1, endLedger: 20_000, filters: [], limit: 10_000 },
      ),
    ).resolves.toEqual({
      events: [purchased],
      oldestLedgerCloseTime: "2026-08-01T00:00:00Z",
    });
    expect(getEvents).toHaveBeenCalledTimes(2);
    expect(getEvents).toHaveBeenLastCalledWith({
      startLedger: 10_001,
      endLedger: 20_001,
      filters: [],
      limit: 10_000,
    });
  });

  it("includes events from the newest ledger in the requested range", async () => {
    const purchased = {
      ...event(
        "pass_purchased",
        testCustomerAddress,
        mapValue({ total: nativeToScVal(BigInt(50_000_000), { type: "i128" }) }),
        "latest-purchase",
      ),
      ledger: 100,
    };
    const getEvents = vi.fn().mockResolvedValue({
      events: [purchased],
      oldestLedgerCloseTime: "2026-08-01T00:00:00Z",
    });

    await expect(
      readEventPages(
        { getEvents },
        { startLedger: 100, endLedger: 100, filters: [], limit: 10_000 },
      ),
    ).resolves.toMatchObject({ events: [purchased] });
    expect(getEvents).toHaveBeenCalledWith({
      startLedger: 100,
      endLedger: 101,
      filters: [],
      limit: 10_000,
    });
  });
});

describe("readOwnedPasses", () => {
  const ownedPass = { id: BigInt(1), owner: testCustomerAddress } as never;

  it("reads only the wallet's paginated owner index when migration is complete", async () => {
    const reader = {
      getMigrationStatus: vi.fn().mockResolvedValue({ passes_complete: true }),
      getOwnerPassCount: vi.fn().mockResolvedValue(BigInt(51)),
      getOwnerPasses: vi
        .fn()
        .mockResolvedValueOnce([ownedPass])
        .mockResolvedValueOnce([]),
      getPassCount: vi.fn(),
      findPass: vi.fn(),
    };

    await expect(readOwnedPasses(reader, testCustomerAddress)).resolves.toEqual([ownedPass]);

    expect(reader.getOwnerPasses).toHaveBeenNthCalledWith(1, testCustomerAddress, BigInt(0), 50);
    expect(reader.getOwnerPasses).toHaveBeenNthCalledWith(2, testCustomerAddress, BigInt(50), 50);
    expect(reader.getPassCount).not.toHaveBeenCalled();
    expect(reader.findPass).not.toHaveBeenCalled();
  });

  it("falls back to authoritative pass reads while the index is migrating", async () => {
    const otherPass = { id: BigInt(2), owner: testRecipientAddress } as never;
    const reader = {
      getMigrationStatus: vi.fn().mockResolvedValue({ passes_complete: false }),
      getOwnerPassCount: vi.fn(),
      getOwnerPasses: vi.fn(),
      getPassCount: vi.fn().mockResolvedValue(BigInt(2)),
      findPass: vi.fn()
        .mockResolvedValueOnce(ownedPass)
        .mockResolvedValueOnce(otherPass),
    };

    await expect(readOwnedPasses(reader, testCustomerAddress)).resolves.toEqual([ownedPass]);
    expect(reader.getOwnerPasses).not.toHaveBeenCalled();
    expect(reader.findPass).toHaveBeenCalledTimes(2);
  });
});
