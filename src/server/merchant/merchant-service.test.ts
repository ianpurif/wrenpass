import { describe, expect, it, vi } from "vitest";

import type { Campaign } from "@/generated/wrenpass-contract/src";
import type { StellarConfig } from "@/lib/stellar/config";
import type { DocumentStore } from "@/server/firestore/document-store";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import {
  MerchantService,
  MerchantServiceError,
} from "@/server/merchant/merchant-service";
import type { MetadataRegistryReader } from "@/server/merchant/metadata-registry-reader";
import type { MerchantProfileEventIndex } from "@/server/merchant/profile-event-index";
import type { CampaignReader } from "@/server/stellar/campaign-reader";

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
const logoUrl = "https://res.cloudinary.com/wrenpass/image/upload/logo.png";
const imageUrl = "https://res.cloudinary.com/wrenpass/image/upload/campaign.png";
const logoSha256 = "a".repeat(64);
const imageSha256 = "b".repeat(64);
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
  metadataContractId: "CCPREVJISOBTO25UJSS53YIA7UMRXCYLUTJBA5K4CSGLTRI4P4IOVFDR",
  redemptionContractId: "CCPREVJISOBTO25UJSS53YIA7UMRXCYLUTJBA5K4CSGLTRI4P4IOVFDR",
};
const profile = {
  id: merchant,
  ownerWalletAddress: merchant,
  businessName: "Wren Studio",
  description: "A neighborhood studio providing complete haircut services.",
  logoUrl,
  logoSha256,
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
};
const metadata = {
  id: "1",
  contractId: config.wrenPassContractId,
  merchantId: merchant,
  name: "Future haircut",
  serviceDescription: "One complete haircut service at the merchant location.",
  imageUrl,
  imageSha256,
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
};

function createRegistry(
  overrides: Partial<MetadataRegistryReader> = {},
): MetadataRegistryReader {
  return {
    getMerchantProfile: async () => profile,
    getCampaignMetadata: async () => metadata,
    getMerchantCampaigns: async () => [metadata],
    ...overrides,
  };
}

function createService({
  foundCampaign = campaign,
  metadataRegistry = createRegistry(),
  profileEventIndex = { indexLatest: vi.fn(async () => undefined) },
  store = new MemoryStore(),
}: {
  foundCampaign?: Campaign | null;
  metadataRegistry?: MetadataRegistryReader;
  profileEventIndex?: Pick<MerchantProfileEventIndex, "indexLatest">;
  store?: DocumentStore;
} = {}) {
  const reader: CampaignReader = { findById: async () => foundCampaign };
  return {
    repositories: createOffchainRepositories(store),
    service: new MerchantService(
      createOffchainRepositories(store),
      reader,
      config,
      metadataRegistry,
      profileEventIndex,
      () => new Date("2026-08-10T00:00:00.000Z"),
    ),
  };
}

describe("MerchantService on-chain metadata cutover", () => {
  it("reads public profile data from Stellar and attaches only a matching provider reference", async () => {
    const store = new MemoryStore();
    const { repositories, service } = createService({ store });
    await repositories.cloudinaryAssetReferences.save({
      id: `merchant-logo:${merchant}`,
      kind: "merchant_logo",
      ownerWalletAddress: merchant,
      resourceId: merchant,
      publicUrl: logoUrl,
      publicId: "wrenpass/merchant-logos/logo",
      sha256: logoSha256,
      updatedAt: "2026-08-10T00:00:00.000Z",
    });

    await expect(service.getProfile(merchant)).resolves.toEqual({
      ...profile,
      logoPublicId: "wrenpass/merchant-logos/logo",
    });
  });

  it("requires a matching wallet-authorized on-chain profile", async () => {
    const { service } = createService();

    await expect(service.saveProfile(merchant, {
      businessName: "Different name",
      description: profile.description,
    })).rejects.toThrow("matching merchant profile on Stellar");
  });

  it("stores only the Cloudinary reference after verifying an on-chain profile", async () => {
    const profileEventIndex = { indexLatest: vi.fn(async () => undefined) };
    const { repositories, service } = createService({ profileEventIndex });

    const saved = await service.saveProfile(merchant, {
      businessName: profile.businessName,
      description: profile.description,
      logoUrl,
      logoPublicId: "wrenpass/merchant-logos/logo",
      logoSha256,
    });

    expect(saved).toEqual({ ...profile, logoPublicId: "wrenpass/merchant-logos/logo" });
    expect(profileEventIndex.indexLatest).toHaveBeenCalledWith(merchant);
    await expect(
      repositories.cloudinaryAssetReferences.findById(`merchant-logo:${merchant}`),
    ).resolves.toMatchObject({
      kind: "merchant_logo",
      publicId: "wrenpass/merchant-logos/logo",
    });
  });

  it("keeps a confirmed on-chain profile usable when event indexing is unavailable", async () => {
    const profileEventIndex = {
      indexLatest: vi.fn(async () => {
        throw new Error("Event index unavailable");
      }),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { service } = createService({ profileEventIndex });

    await expect(service.saveProfile(merchant, {
      businessName: profile.businessName,
      description: profile.description,
    })).resolves.toMatchObject(profile);
    expect(warn).toHaveBeenCalledWith(
      "The profile is on-chain, but its event index was not updated.",
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it("rejects campaign metadata from a wallet that does not own the campaign", async () => {
    const { service } = createService();

    await expect(service.saveCampaignMetadata("GOTHER", {
      campaignId: "1",
      name: metadata.name,
      serviceDescription: metadata.serviceDescription,
      imageUrl,
      imagePublicId: "wrenpass/campaign-images/campaign",
      imageSha256,
    })).rejects.toThrow(MerchantServiceError);
  });

  it("rejects campaigns using an unsupported payment asset", async () => {
    const { service } = createService({
      foundCampaign: { ...campaign, payment_asset: config.wrenPassContractId },
    });

    await expect(service.saveCampaignMetadata(merchant, {
      campaignId: "1",
      name: metadata.name,
      serviceDescription: metadata.serviceDescription,
      imageUrl,
      imagePublicId: "wrenpass/campaign-images/campaign",
      imageSha256,
    })).rejects.toThrow("unsupported payment asset");
  });

  it("stores a campaign image reference only after matching immutable on-chain metadata", async () => {
    const { repositories, service } = createService();

    const saved = await service.saveCampaignMetadata(merchant, {
      campaignId: "1",
      name: metadata.name,
      serviceDescription: metadata.serviceDescription,
      imageUrl,
      imagePublicId: "wrenpass/campaign-images/campaign",
      imageSha256,
    });

    expect(saved).toEqual({
      ...metadata,
      imagePublicId: "wrenpass/campaign-images/campaign",
    });
    await expect(
      repositories.cloudinaryAssetReferences.findById("campaign-image:1"),
    ).resolves.toMatchObject({
      kind: "campaign_image",
      publicId: "wrenpass/campaign-images/campaign",
    });
  });

  it("loads dashboards and public pages from Stellar when provider storage is unavailable", async () => {
    const failedStore: DocumentStore = {
      read: async () => { throw new Error("Firestore unavailable"); },
      findMany: async () => { throw new Error("Firestore unavailable"); },
      write: async () => { throw new Error("Firestore unavailable"); },
      remove: async () => undefined,
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { service } = createService({ store: failedStore });

    await expect(service.getDashboard(merchant)).resolves.toMatchObject({
      merchant: profile,
      campaigns: [{ metadata }],
    });
    await expect(service.getPublicCampaign("1")).resolves.toMatchObject({
      merchant: profile,
      metadata,
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not hide metadata registry failures behind stale Firestore data", async () => {
    const registry = createRegistry({
      getMerchantProfile: async () => { throw new Error("RPC unavailable"); },
    });
    const { service } = createService({ metadataRegistry: registry });

    await expect(service.getProfile(merchant)).rejects.toThrow("RPC unavailable");
  });
});
