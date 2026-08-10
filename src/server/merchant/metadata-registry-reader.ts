import "server-only";

import type {
  CampaignMetadata as ContractCampaignMetadata,
  MerchantProfile as ContractMerchantProfile,
} from "@/generated/metadata-contract/src";
import type { StellarConfig } from "@/lib/stellar/config";
import { StellarMetadataContractReader } from "@/lib/stellar/metadata-client";
import {
  campaignMetadataSchema,
  merchantSchema,
  type CampaignMetadata,
  type Merchant,
} from "@/server/models";

export interface MetadataRegistryReader {
  getMerchantProfile(walletAddress: string): Promise<Merchant | null>;
  getCampaignMetadata(campaignId: string): Promise<CampaignMetadata | null>;
  getMerchantCampaigns(walletAddress: string): Promise<CampaignMetadata[]>;
}

function ledgerTimestampToIso(timestamp: bigint): string {
  const milliseconds = Number(timestamp) * 1_000;
  const value = new Date(milliseconds);
  if (!Number.isSafeInteger(milliseconds) || Number.isNaN(value.getTime())) {
    throw new Error("The metadata registry returned an invalid timestamp.");
  }
  return value.toISOString();
}

function hashHex(value: Buffer | undefined): string | undefined {
  return value?.toString("hex");
}

function toMerchant(profile: ContractMerchantProfile): Merchant {
  return merchantSchema.parse({
    id: profile.owner,
    ownerWalletAddress: profile.owner,
    businessName: profile.business_name,
    description: profile.description,
    logoUrl: profile.logo_url,
    logoSha256: hashHex(profile.logo_sha256),
    createdAt: ledgerTimestampToIso(profile.created_at),
    updatedAt: ledgerTimestampToIso(profile.updated_at),
  });
}

function toCampaignMetadata(
  metadata: ContractCampaignMetadata,
  contractId: string,
): CampaignMetadata {
  const timestamp = ledgerTimestampToIso(metadata.created_at);
  return campaignMetadataSchema.parse({
    id: metadata.campaign_id.toString(),
    contractId,
    merchantId: metadata.merchant,
    name: metadata.name,
    serviceDescription: metadata.service_description,
    imageUrl: metadata.image_url,
    imageSha256: hashHex(metadata.image_sha256),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export class StellarMetadataRegistryReader implements MetadataRegistryReader {
  private readonly reader: StellarMetadataContractReader;

  constructor(private readonly config: StellarConfig) {
    this.reader = new StellarMetadataContractReader(config);
  }

  async getMerchantProfile(walletAddress: string): Promise<Merchant | null> {
    const profile = await this.reader.getMerchantProfile(walletAddress);
    return profile ? toMerchant(profile) : null;
  }

  async getCampaignMetadata(campaignId: string): Promise<CampaignMetadata | null> {
    const metadata = await this.reader.getCampaignMetadata(BigInt(campaignId));
    return metadata ? toCampaignMetadata(metadata, this.config.wrenPassContractId) : null;
  }

  async getMerchantCampaigns(walletAddress: string): Promise<CampaignMetadata[]> {
    const campaigns = await this.reader.getMerchantCampaigns(walletAddress);
    return campaigns.map((metadata) =>
      toCampaignMetadata(metadata, this.config.wrenPassContractId));
  }
}

export function createMetadataRegistryReader(config: StellarConfig): MetadataRegistryReader {
  return new StellarMetadataRegistryReader(config);
}
