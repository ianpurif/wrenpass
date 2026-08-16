// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { IndexedBlockchainEvent } from "@/server/models";
import type { WrenPassEvent } from "@/server/events/event-source";
import { mergeWalletReportEvents } from "@/server/reports/wallet-report-events";

const observedAt = "2026-08-16T00:00:00.000Z";
const retainedPurchase: WrenPassEvent = {
  id: "000100-1",
  transactionHash: "purchase-hash",
  eventIndex: 1,
  ledger: 100,
  eventType: "pass_purchased",
  campaignId: "4",
  passId: "18",
  customer: "GBUYER",
  payload: { amount: "50000000" },
};

describe("mergeWalletReportEvents", () => {
  it("recovers a retained purchase that has not reached the Firestore index", () => {
    expect(mergeWalletReportEvents({
      indexedEvents: [],
      retainedEvents: [retainedPurchase],
      contractId: "CCONTRACT",
      observedAt,
    })).toEqual([
      expect.objectContaining({
        id: retainedPurchase.id,
        source: "stellar_rpc_recovered",
        indexedAt: observedAt,
        payload: expect.objectContaining({ customer: "GBUYER", campaignId: "4" }),
      }),
    ]);
  });

  it("keeps the indexed record as the source of truth when both sources contain it", () => {
    const indexed: IndexedBlockchainEvent = {
      id: retainedPurchase.id,
      contractId: "CCONTRACT",
      transactionHash: retainedPurchase.transactionHash,
      eventIndex: 1,
      ledger: 100,
      eventType: "pass_purchased",
      payload: { campaignId: "4", customer: "GBUYER" },
      indexedAt: "2026-08-15T00:00:00.000Z",
    };

    expect(mergeWalletReportEvents({
      indexedEvents: [indexed],
      retainedEvents: [retainedPurchase],
      contractId: "CCONTRACT",
      observedAt,
    })).toEqual([{ ...indexed, source: "indexed_cache" }]);
  });
});
