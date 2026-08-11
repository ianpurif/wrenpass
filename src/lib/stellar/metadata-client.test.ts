// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StellarMetadataContractWriter } from "@/lib/stellar/metadata-client";
import { testCustomerAddress, testStellarConfig } from "@/test/fixtures/customer";

const contractMocks = vi.hoisted(() => {
  const registerCampaignMetadata = vi.fn();
  const Client = vi.fn(function MockClient() {
    return { register_campaign_metadata: registerCampaignMetadata };
  });
  return { Client, registerCampaignMetadata };
});

vi.mock("@/generated/metadata-contract/src", () => ({
  Client: contractMocks.Client,
}));

const input = {
  campaignId: BigInt(2),
  merchant: testCustomerAddress,
  metadata: {
    name: "Quick tune-up",
    serviceDescription: "A complete bicycle safety check and basic tune-up service.",
  },
  signTransaction: vi.fn(),
};

describe("StellarMetadataContractWriter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    contractMocks.Client.mockClear();
    contractMocks.registerCampaignMetadata.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a transient campaign visibility failure before requesting a wallet signature", async () => {
    const storedMetadata = { campaign_id: BigInt(2) };
    const signAndSend = vi.fn().mockResolvedValue({
      result: {
        isErr: () => false,
        unwrap: () => storedMetadata,
      },
    });
    contractMocks.registerCampaignMetadata
      .mockRejectedValueOnce(
        new Error('Transaction simulation failed: "HostError: Error(Contract, #8)"'),
      )
      .mockRejectedValueOnce(
        new Error('Transaction simulation failed: "HostError: Error(Contract, #8)"'),
      )
      .mockResolvedValue({ signAndSend });

    const pending = new StellarMetadataContractWriter(testStellarConfig)
      .registerCampaignMetadata(input);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toBe(storedMetadata);
    expect(contractMocks.registerCampaignMetadata).toHaveBeenCalledTimes(3);
    expect(signAndSend).toHaveBeenCalledOnce();
  });

  it("does not retry unrelated simulation failures", async () => {
    contractMocks.registerCampaignMetadata.mockRejectedValue(
      new Error("Transaction simulation failed: RPC unavailable"),
    );

    await expect(
      new StellarMetadataContractWriter(testStellarConfig)
        .registerCampaignMetadata(input),
    ).rejects.toThrow("RPC unavailable");
    expect(contractMocks.registerCampaignMetadata).toHaveBeenCalledOnce();
  });
});
