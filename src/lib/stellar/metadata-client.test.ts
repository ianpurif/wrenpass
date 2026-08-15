// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StellarMetadataContractReader,
  StellarMetadataContractWriter,
} from "@/lib/stellar/metadata-client";
import { testCustomerAddress, testStellarConfig } from "@/test/fixtures/customer";

const contractMocks = vi.hoisted(() => {
  const registerCampaignMetadata = vi.fn();
  const merchantCampaignCount = vi.fn();
  const getMerchantCampaigns = vi.fn();
  const Client = vi.fn(function MockClient() {
    return {
      get_merchant_campaigns: getMerchantCampaigns,
      merchant_campaign_count: merchantCampaignCount,
      register_campaign_metadata: registerCampaignMetadata,
    };
  });
  return { Client, getMerchantCampaigns, merchantCampaignCount, registerCampaignMetadata };
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

describe("StellarMetadataContractReader", () => {
  it("loads independent campaign index pages concurrently and preserves page order", async () => {
    contractMocks.merchantCampaignCount.mockResolvedValue({ result: BigInt(51) });
    let releaseFirstPage: ((value: unknown) => void) | undefined;
    const firstPage = new Promise((resolve) => {
      releaseFirstPage = resolve;
    });
    const firstCampaign = { campaign_id: BigInt(1) };
    const lastCampaign = { campaign_id: BigInt(51) };
    const ok = (value: unknown[]) => ({
      result: {
        isErr: () => false,
        unwrap: () => value,
      },
    });
    contractMocks.getMerchantCampaigns
      .mockReturnValueOnce(firstPage)
      .mockResolvedValueOnce(ok([lastCampaign]));

    const pending = new StellarMetadataContractReader(testStellarConfig)
      .getMerchantCampaigns(testCustomerAddress);
    await vi.waitFor(() => expect(contractMocks.getMerchantCampaigns).toHaveBeenCalledTimes(2));
    releaseFirstPage?.(ok([firstCampaign]));

    await expect(pending).resolves.toEqual([firstCampaign, lastCampaign]);
    expect(contractMocks.getMerchantCampaigns).toHaveBeenNthCalledWith(1, {
      merchant: testCustomerAddress,
      cursor: BigInt(0),
      limit: 50,
    });
    expect(contractMocks.getMerchantCampaigns).toHaveBeenNthCalledWith(2, {
      merchant: testCustomerAddress,
      cursor: BigInt(50),
      limit: 50,
    });
  });
});
