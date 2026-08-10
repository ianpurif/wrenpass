import type { Campaign } from "@/generated/wrenpass-contract/src";
import type { StellarConfig } from "@/lib/stellar/config";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import {
  MerchantService,
  MerchantServiceError,
} from "@/server/merchant/merchant-service";
import type { CampaignReader } from "@/server/stellar/campaign-reader";
import type { DocumentStore } from "@/server/firestore/document-store";
import { describe, expect, it } from "vitest";

class MemoryStore implements DocumentStore {
  private readonly documents = new Map<string, Record<string, unknown>>();

  read(collection: string, id: string): Promise<unknown | null> {
    return Promise.resolve(this.documents.get(`${collection}/${id}`) ?? null);
  }

  findMany(collection: string, field: string, value: string): Promise<unknown[]> {
    return Promise.resolve(
      [...this.documents.entries()]
        .filter(([key, document]) => key.startsWith(`${collection}/`) && document[field] === value)
        .map(([, document]) => document),
    );
  }

  write(collection: string, id: string, data: Record<string, unknown>): Promise<void> {
    this.documents.set(`${collection}/${id}`, data);
    return Promise.resolve();
  }

  remove(collection: string, id: string): Promise<void> {
    this.documents.delete(`${collection}/${id}`);
    return Promise.resolve();
  }
}

const merchant = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const assetContractId = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const campaign: Campaign = {
  id: BigInt(1),
  merchant,
  platform: merchant,
  payment_asset: assetContractId,
  pass_price: BigInt(50_000_000),
  service_value: BigInt(60_000_000),
  max_supply: 100,
  sold: 0,
  redeemed: 0,
  refunded: 0,
  merchant_released: BigInt(0),
  protected_funds: BigInt(0),
  platform_fees_paid: BigInt(0),
  cancellation_funds: BigInt(0),
  cancellation_shortfall: BigInt(0),
  expires_at: BigInt(2_000_000_000),
  created_at: BigInt(1_900_000_000),
  financial_rules: { merchant_bps: 7_500, reserve_bps: 2_000, platform_fee_bps: 500 },
  status: { tag: "Draft", values: undefined },
};
const config: StellarConfig = {
  network: "testnet",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  assetCode: "USDC",
  assetIssuer: merchant,
  assetContractId,
  wrenPassContractId: "CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D",
  reviewContractId: "CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D",
};

function createService(foundCampaign: Campaign | null = campaign) {
  const reader: CampaignReader = { findById: async () => foundCampaign };
  return new MerchantService(
    createOffchainRepositories(new MemoryStore()),
    reader,
    config,
    () => new Date("2026-08-09T00:00:00.000Z"),
  );
}

describe("MerchantService", () => {
  it("binds the public profile to the authenticated wallet", async () => {
    const service = createService();
    const profile = await service.saveProfile(merchant, {
      businessName: "Wren Studio",
      description: "A neighborhood studio providing complete haircut services.",
    });

    expect(profile.id).toBe(merchant);
    expect(profile.ownerWalletAddress).toBe(merchant);
    expect(await service.getProfile(merchant)).toEqual(profile);
  });

  it("rejects metadata registration by a wallet that does not own the campaign", async () => {
    const service = createService();
    await expect(
      service.saveCampaignMetadata("GOTHER", {
        campaignId: "1",
        name: "Future haircut",
        serviceDescription: "One complete haircut service at the merchant location.",
      }),
    ).rejects.toThrow(MerchantServiceError);
  });

  it("registers metadata idempotently but rejects a conflicting overwrite", async () => {
    const service = createService();
    await service.saveProfile(merchant, {
      businessName: "Wren Studio",
      description: "A neighborhood studio providing complete haircut services.",
    });
    const input = {
      campaignId: "1",
      name: "Future haircut",
      serviceDescription: "One complete haircut service at the merchant location.",
    };

    const saved = await service.saveCampaignMetadata(merchant, input);
    expect(await service.saveCampaignMetadata(merchant, input)).toEqual(saved);
    await expect(
      service.saveCampaignMetadata(merchant, { ...input, name: "Changed campaign" }),
    ).rejects.toThrow("already registered");
  });

  it("rejects an unsupported on-chain payment asset", async () => {
    const service = createService({ ...campaign, payment_asset: config.wrenPassContractId });
    await service.saveProfile(merchant, {
      businessName: "Wren Studio",
      description: "A neighborhood studio providing complete haircut services.",
    });
    await expect(
      service.saveCampaignMetadata(merchant, {
        campaignId: "1",
        name: "Future haircut",
        serviceDescription: "One complete haircut service at the merchant location.",
      }),
    ).rejects.toThrow("unsupported payment asset");
  });
});
