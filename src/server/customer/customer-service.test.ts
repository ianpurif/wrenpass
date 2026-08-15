import type { Pass } from "@/generated/wrenpass-contract/src";
import type { CustomerChainReader } from "@/server/stellar/customer-chain-reader";
import { CustomerService } from "@/server/customer/customer-service";
import { describe, expect, it, vi } from "vitest";

import {
  testCustomerAddress,
  testPublicCampaign,
  testRecipientAddress,
} from "@/test/fixtures/customer";

function pass(id: number, owner: string): Pass {
  return {
    id: BigInt(id),
    campaign_id: BigInt(1),
    owner,
    status: { tag: "Active", values: undefined },
    purchased_at: BigInt(1_786_261_200 + id),
    purchase_amounts: {
      total: BigInt(50_000_000),
      merchant_release: BigInt(37_500_000),
      protected_reserve: BigInt(10_000_000),
      platform_fee: BigInt(2_500_000),
    },
  };
}

describe("CustomerService", () => {
  it("returns only current ownership without waiting for an activity scan", async () => {
    const passes = [pass(1, testCustomerAddress), pass(2, testRecipientAddress)];
    const reader: CustomerChainReader = {
      getOwnedPasses: vi.fn().mockResolvedValue([passes[0]]),
      getPassCount: vi.fn().mockResolvedValue(BigInt(2)),
      findPass: vi.fn(async (id: bigint) => passes[Number(id) - 1] ?? null),
      readRecentActivity: vi.fn().mockResolvedValue({
        activity: [],
        startsAt: "2026-08-02T00:00:00.000Z",
      }),
    };
    const campaigns = { getPublicCampaign: vi.fn().mockResolvedValue(testPublicCampaign) };

    const ownedPasses = await new CustomerService(reader, campaigns).getPasses(testCustomerAddress);

    expect(ownedPasses).toHaveLength(1);
    expect(ownedPasses[0]).toEqual(
      expect.objectContaining({ id: "1", owner: testCustomerAddress, campaign: testPublicCampaign }),
    );
    expect(reader.getOwnedPasses).toHaveBeenCalledWith(testCustomerAddress);
    expect(reader.findPass).not.toHaveBeenCalled();
    expect(reader.readRecentActivity).not.toHaveBeenCalled();
  });

  it("loads activity without scanning the pass collection", async () => {
    const reader: CustomerChainReader = {
      getOwnedPasses: vi.fn(),
      getPassCount: vi.fn(),
      findPass: vi.fn(),
      readRecentActivity: vi.fn().mockResolvedValue({
        activity: [],
        startsAt: "2026-08-02T00:00:00.000Z",
      }),
    };
    const campaigns = { getPublicCampaign: vi.fn() };

    const activity = await new CustomerService(reader, campaigns).getActivity(testCustomerAddress);

    expect(activity).toEqual({
      activity: [],
      activityWindowStartsAt: "2026-08-02T00:00:00.000Z",
    });
    expect(reader.getPassCount).not.toHaveBeenCalled();
    expect(reader.findPass).not.toHaveBeenCalled();
  });
});
