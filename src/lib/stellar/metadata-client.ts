import { Buffer } from "buffer";
import type { ClientOptions } from "@stellar/stellar-sdk/contract";

import {
  Client,
  type CampaignMetadata,
  type CampaignMetadataInput,
  type MerchantProfile,
  type MerchantProfileInput,
  type RegistryConfig,
} from "@/generated/metadata-contract/src";
import type { StellarConfig } from "@/lib/stellar/config";

type SignTransaction = NonNullable<ClientOptions["signTransaction"]>;

const contractErrorMessages: Record<string, string> = {
  CampaignNotFound: "The on-chain campaign was not found.",
  InvalidBusinessDescription: "Check the business description.",
  InvalidBusinessName: "Check the business name.",
  InvalidCampaignName: "Check the campaign name.",
  InvalidImage: "The image reference is invalid.",
  InvalidServiceDescription: "Check the service description.",
  MetadataConflict: "Campaign metadata is already registered on-chain.",
  Unauthorized: "The connected wallet does not own this campaign.",
};

function unwrapContractResult<T>(result: {
  isErr(): boolean;
  unwrap(): T;
  unwrapErr(): { message: string };
}): T {
  if (result.isErr()) {
    const contractMessage = result.unwrapErr().message;
    throw new Error(
      contractErrorMessages[contractMessage]
        ?? `Metadata contract rejected the action: ${contractMessage}`,
    );
  }
  return result.unwrap();
}

function createClient(
  config: StellarConfig,
  options: { publicKey?: string; signTransaction?: SignTransaction } = {},
): Client {
  return new Client({
    contractId: config.metadataContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    ...options,
  });
}

function hashBuffer(value: string | undefined): Buffer | undefined {
  return value ? Buffer.from(value, "hex") : undefined;
}

export interface MerchantProfileContractInput {
  businessName: string;
  description: string;
  logoUrl?: string;
  logoSha256?: string;
}

export interface CampaignMetadataContractInput {
  name: string;
  serviceDescription: string;
  imageUrl?: string;
  imageSha256?: string;
}

export class StellarMetadataContractWriter {
  constructor(private readonly config: StellarConfig) {}

  async setMerchantProfile(input: {
    merchant: string;
    profile: MerchantProfileContractInput;
    signTransaction: SignTransaction;
  }): Promise<MerchantProfile> {
    const profile: MerchantProfileInput = {
      business_name: input.profile.businessName,
      description: input.profile.description,
      logo_sha256: hashBuffer(input.profile.logoSha256),
      logo_url: input.profile.logoUrl,
    };
    const transaction = await createClient(this.config, {
      publicKey: input.merchant,
      signTransaction: input.signTransaction,
    }).set_merchant_profile({ merchant: input.merchant, profile });
    const sent = await transaction.signAndSend();
    return unwrapContractResult(sent.result);
  }

  async registerCampaignMetadata(input: {
    campaignId: bigint;
    merchant: string;
    metadata: CampaignMetadataContractInput;
    signTransaction: SignTransaction;
  }): Promise<CampaignMetadata> {
    const metadata: CampaignMetadataInput = {
      image_sha256: hashBuffer(input.metadata.imageSha256),
      image_url: input.metadata.imageUrl,
      name: input.metadata.name,
      service_description: input.metadata.serviceDescription,
    };
    const transaction = await createClient(this.config, {
      publicKey: input.merchant,
      signTransaction: input.signTransaction,
    }).register_campaign_metadata({
      campaign_id: input.campaignId,
      merchant: input.merchant,
      metadata,
    });
    const sent = await transaction.signAndSend();
    return unwrapContractResult(sent.result);
  }
}

export class StellarMetadataContractReader {
  constructor(private readonly config: StellarConfig) {}

  async getConfig(): Promise<RegistryConfig> {
    const transaction = await createClient(this.config).get_config();
    return unwrapContractResult(transaction.result);
  }

  async getStorageVersion(): Promise<number> {
    const transaction = await createClient(this.config).storage_version();
    return transaction.result;
  }

  async getMerchantProfile(merchant: string): Promise<MerchantProfile | null> {
    const transaction = await createClient(this.config).get_merchant_profile({ merchant });
    return transaction.result ?? null;
  }

  async getCampaignMetadata(campaignId: bigint): Promise<CampaignMetadata | null> {
    const transaction = await createClient(this.config).get_campaign_metadata({
      campaign_id: campaignId,
    });
    return transaction.result ?? null;
  }

  async getMerchantCampaignCount(merchant: string): Promise<bigint> {
    const transaction = await createClient(this.config).merchant_campaign_count({ merchant });
    return transaction.result;
  }

  async getMerchantCampaigns(merchant: string): Promise<CampaignMetadata[]> {
    const client = createClient(this.config);
    const countTransaction = await client.merchant_campaign_count({ merchant });
    const count = countTransaction.result;
    const campaigns: CampaignMetadata[] = [];
    const pageSize = 50;

    for (let cursor = BigInt(0); cursor < count; cursor += BigInt(pageSize)) {
      const transaction = await client.get_merchant_campaigns({
        merchant,
        cursor,
        limit: pageSize,
      });
      campaigns.push(...unwrapContractResult(transaction.result));
    }
    return campaigns;
  }
}
