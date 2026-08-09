import "server-only";

import type { Campaign } from "@/generated/wrenpass-contract/src";
import type {
  MerchantCampaignDto,
  MerchantDashboardDto,
  OnchainCampaignDto,
  PublicCampaignDto,
} from "@/features/merchant/dto";
import type { StellarConfig } from "@/lib/stellar/config";
import type { OffchainRepositories } from "@/server/firestore/repositories";
import {
  campaignMetadataSchema,
  cloudinaryPublicIdSchema,
  merchantSchema,
  type CampaignMetadata,
  type Merchant,
} from "@/server/models";
import type { CampaignReader } from "@/server/stellar/campaign-reader";
import { z } from "zod";

const merchantProfileUpdateSchema = z
  .object({
    businessName: z.string().trim().min(2).max(140),
    description: z.string().trim().min(20).max(2_000),
    logoUrl: z
      .url()
      .refine((value) => new URL(value).hostname === "res.cloudinary.com")
      .optional(),
    logoPublicId: cloudinaryPublicIdSchema.optional(),
  })
  .refine((value) => Boolean(value.logoUrl) === Boolean(value.logoPublicId), {
    message: "Logo URL and public ID must be provided together.",
  });

const campaignMetadataInputSchema = z
  .object({
    campaignId: z.string().regex(/^[1-9]\d{0,19}$/),
    name: z.string().trim().min(3).max(140),
    serviceDescription: z.string().trim().min(20).max(4_000),
    imageUrl: z
      .url()
      .refine((value) => new URL(value).hostname === "res.cloudinary.com")
      .optional(),
    imagePublicId: cloudinaryPublicIdSchema.optional(),
  })
  .refine((value) => Boolean(value.imageUrl) === Boolean(value.imagePublicId), {
    message: "Image URL and public ID must be provided together.",
  });

export type MerchantProfileUpdate = z.infer<typeof merchantProfileUpdateSchema>;
export type CampaignMetadataInput = z.infer<typeof campaignMetadataInputSchema>;

export class MerchantServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MerchantServiceError";
  }
}

function toOnchainDto(campaign: Campaign): OnchainCampaignDto {
  return {
    id: campaign.id.toString(),
    merchant: campaign.merchant,
    passPrice: campaign.pass_price.toString(),
    serviceValue: campaign.service_value.toString(),
    maxSupply: campaign.max_supply,
    sold: campaign.sold,
    remaining: campaign.max_supply - campaign.sold,
    redeemed: campaign.redeemed,
    refunded: campaign.refunded,
    merchantReleased: campaign.merchant_released.toString(),
    protectedFunds: campaign.protected_funds.toString(),
    platformFeesPaid: campaign.platform_fees_paid.toString(),
    expiresAt: campaign.expires_at.toString(),
    financialRules: {
      merchantBps: campaign.financial_rules.merchant_bps,
      reserveBps: campaign.financial_rules.reserve_bps,
      platformFeeBps: campaign.financial_rules.platform_fee_bps,
    },
    status: campaign.status.tag,
  };
}

export class MerchantService {
  constructor(
    private readonly repositories: OffchainRepositories,
    private readonly campaignReader: CampaignReader,
    private readonly stellarConfig: StellarConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getProfile(walletAddress: string): Promise<Merchant | null> {
    return this.repositories.merchants.findById(walletAddress);
  }

  async saveProfile(walletAddress: string, input: MerchantProfileUpdate): Promise<Merchant> {
    const validated = merchantProfileUpdateSchema.parse(input);
    const existing = await this.repositories.merchants.findById(walletAddress);
    const timestamp = this.now().toISOString();
    return this.repositories.merchants.save(
      merchantSchema.parse({
        id: walletAddress,
        ownerWalletAddress: walletAddress,
        businessName: validated.businessName,
        description: validated.description,
        logoUrl: validated.logoUrl ?? existing?.logoUrl,
        logoPublicId: validated.logoPublicId ?? existing?.logoPublicId,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }),
    );
  }

  async saveCampaignMetadata(
    walletAddress: string,
    input: CampaignMetadataInput,
  ): Promise<CampaignMetadata> {
    const validated = campaignMetadataInputSchema.parse(input);
    const campaign = await this.campaignReader.findById(validated.campaignId);
    if (!campaign) throw new MerchantServiceError("The on-chain campaign was not found.");
    if (campaign.merchant !== walletAddress) {
      throw new MerchantServiceError("The authenticated wallet does not own this campaign.");
    }
    if (campaign.payment_asset !== this.stellarConfig.assetContractId) {
      throw new MerchantServiceError("The campaign uses an unsupported payment asset.");
    }
    if (!(await this.repositories.merchants.findById(walletAddress))) {
      throw new MerchantServiceError("Create your merchant profile before registering a campaign.");
    }

    const existing = await this.repositories.campaignMetadata.findById(validated.campaignId);
    if (existing) {
      const sameMetadata =
        existing.merchantId === walletAddress &&
        existing.name === validated.name &&
        existing.serviceDescription === validated.serviceDescription &&
        existing.imageUrl === validated.imageUrl &&
        existing.imagePublicId === validated.imagePublicId;
      if (!sameMetadata) {
        throw new MerchantServiceError("Campaign metadata is already registered.");
      }
      return existing;
    }

    const timestamp = this.now().toISOString();
    return this.repositories.campaignMetadata.save(
      campaignMetadataSchema.parse({
        id: validated.campaignId,
        contractId: this.stellarConfig.wrenPassContractId,
        merchantId: walletAddress,
        name: validated.name,
        serviceDescription: validated.serviceDescription,
        imageUrl: validated.imageUrl,
        imagePublicId: validated.imagePublicId,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
  }

  async getDashboard(walletAddress: string): Promise<MerchantDashboardDto> {
    const [merchant, metadata] = await Promise.all([
      this.getProfile(walletAddress),
      this.repositories.campaignMetadata.findByField("merchantId", walletAddress),
    ]);
    const campaigns = await Promise.all(
      metadata.map(async (item): Promise<MerchantCampaignDto> => {
        const campaign = await this.campaignReader.findById(item.id);
        if (!campaign) {
          throw new MerchantServiceError(`On-chain campaign ${item.id} is unavailable.`);
        }
        return { metadata: item, onchain: toOnchainDto(campaign) };
      }),
    );
    campaigns.sort((left, right) => right.metadata.createdAt.localeCompare(left.metadata.createdAt));
    return { merchant, campaigns };
  }

  async getPublicCampaign(campaignId: string): Promise<PublicCampaignDto | null> {
    const metadata = await this.repositories.campaignMetadata.findById(campaignId);
    if (!metadata) return null;
    const [campaign, merchant] = await Promise.all([
      this.campaignReader.findById(campaignId),
      this.repositories.merchants.findById(metadata.merchantId),
    ]);
    if (!campaign || !merchant) return null;
    return { metadata, merchant, onchain: toOnchainDto(campaign) };
  }
}
