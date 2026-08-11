import { describe, expect, it, vi } from "vitest";

import { CampaignTransactionIndex } from "@/server/campaign-transactions/campaign-transaction-index";
import {
  campaignEventKey,
  encodeCampaignTransactionCursor,
} from "@/server/campaign-transactions/campaign-event-key";
import { indexedBlockchainEventSchema } from "@/server/models";
import { testStellarConfig } from "@/test/fixtures/customer";

function purchaseEvent(id: string, passId: string, total: string) {
  return indexedBlockchainEventSchema.parse({
    id,
    contractId: testStellarConfig.wrenPassContractId,
    transactionHash: passId.padStart(64, "a").slice(0, 64),
    campaignEventKey: campaignEventKey("1", id),
    eventIndex: Number(passId),
    ledger: 1_234_500 + Number(passId),
    eventType: "pass_purchased",
    payload: { campaignId: "1", passId, total },
    indexedAt: "2026-08-11T00:00:00.000Z",
  });
}

describe("CampaignTransactionIndex", () => {
  it("returns a cursor-paginated campaign purchase page", async () => {
    const first = purchaseEvent("000002-000001", "2", "50000000");
    const second = purchaseEvent("000001-000001", "1", "50000000");
    const nextKey = second.campaignEventKey!;
    const store = {
      readPage: vi.fn()
        .mockResolvedValueOnce({ events: [first, second], hasMore: true, nextKey })
        .mockResolvedValueOnce({ events: [], hasMore: false, nextKey: null }),
    };
    const index = new CampaignTransactionIndex(store);

    const page = await index.readPage({ campaignId: "1", limit: 2 });

    expect(page.transactions.map((transaction) => transaction.passId)).toEqual(["2", "1"]);
    expect(page.transactions[0]).toMatchObject({ total: "50000000", ledger: 1_234_502 });
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe(encodeCampaignTransactionCursor(nextKey));

    await index.readPage({ campaignId: "1", cursor: page.nextCursor!, limit: 2 });
    expect(store.readPage).toHaveBeenNthCalledWith(2, {
      campaignId: "1",
      afterKey: nextKey,
      limit: 2,
    });
  });

  it("rejects a cursor from another campaign", async () => {
    const store = { readPage: vi.fn() };
    const index = new CampaignTransactionIndex(store);

    await expect(index.readPage({
      campaignId: "1",
      cursor: encodeCampaignTransactionCursor(campaignEventKey("2", "event-1")),
      limit: 10,
    })).rejects.toThrow("cursor is invalid");
    expect(store.readPage).not.toHaveBeenCalled();
  });
});
