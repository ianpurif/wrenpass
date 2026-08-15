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
  cloudinaryPublicIdSchema,
  sha256Schema,
  type CampaignMetadata,
  type CloudinaryAssetReference,
  type Merchant,
} from "@/server/models";
import type { CampaignReader } from "@/server/stellar/campaign-reader";
import type { MetadataRegistryReader } from "@/server/merchant/metadata-registry-reader";
import type { MerchantProfileEventIndex } from "@/server/merchant/profile-event-index";
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
    logoSha256: sha256Schema.optional(),
  })
  .refine((value) => Boolean(value.logoUrl) === Boolean(value.logoPublicId), {
    message: "Logo URL and public ID must be provided together.",
  })
  .refine((value) => !value.logoSha256 || Boolean(value.logoUrl), {
    message: "Logo hash requires a logo URL.",
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
    imageSha256: sha256Schema.optional(),
  })
  .refine((value) => Boolean(value.imageUrl) === Boolean(value.imagePublicId), {
    message: "Image URL and public ID must be provided together.",
  })
  .refine((value) => !value.imageSha256 || Boolean(value.imageUrl), {
    message: "Image hash requires an image URL.",
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

function mergeMerchant(
  onchain: Merchant | null,
  reference: CloudinaryAssetReference | null,
): Merchant | null {
  if (!onchain) return null;
  return {
    ...onchain,
    ...(referenceMatches(reference, "merchant_logo", onchain.id, onchain.logoUrl, onchain.logoSha256)
      ? { logoPublicId: reference.publicId }
      : {}),
  };
}

function mergeCampaignMetadata(
  onchain: CampaignMetadata,
  reference: CloudinaryAssetReference | null,
): CampaignMetadata {
  return {
    ...onchain,
    ...(referenceMatches(reference, "campaign_image", onchain.id, onchain.imageUrl, onchain.imageSha256)
      ? { imagePublicId: reference.publicId }
      : {}),
  };
}

function referenceMatches(
  reference: CloudinaryAssetReference | null,
  kind: CloudinaryAssetReference["kind"],
  resourceId: string,
  publicUrl: string | undefined,
  sha256: string | undefined,
): reference is CloudinaryAssetReference {
  return Boolean(reference)
    && reference?.kind === kind
    && reference.resourceId === resourceId
    && reference.publicUrl === publicUrl
    && (sha256 === undefined || reference.sha256 === sha256);
}

function merchantLogoReferenceId(walletAddress: string): string {
  return `merchant-logo:${walletAddress}`;
}

function campaignImageReferenceId(campaignId: string): string {
  return `campaign-image:${campaignId}`;
}

function profileMatchesChain(
  profile: Merchant,
  input: MerchantProfileUpdate,
): boolean {
  return profile.businessName === input.businessName
    && profile.description === input.description
    && (input.logoUrl === undefined || profile.logoUrl === input.logoUrl)
    && (input.logoSha256 === undefined || profile.logoSha256 === input.logoSha256);
}

function campaignMetadataMatchesChain(
  metadata: CampaignMetadata,
  walletAddress: string,
  input: CampaignMetadataInput,
): boolean {
  return metadata.id === input.campaignId
    && metadata.merchantId === walletAddress
    && metadata.name === input.name
    && metadata.serviceDescription === input.serviceDescription
    && metadata.imageUrl === input.imageUrl
    && metadata.imageSha256 === input.imageSha256;
}

export class MerchantService {
  constructor(
    private readonly repositories: OffchainRepositories,
    private readonly campaignReader: CampaignReader,
    private readonly stellarConfig: StellarConfig,
    private readonly metadataRegistry: MetadataRegistryReader,
    private readonly profileEventIndex: Pick<MerchantProfileEventIndex, "indexLatest">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getProfile(walletAddress: string): Promise<Merchant | null> {
    const referencePromise = this.repositories.cloudinaryAssetReferences
      .findById(merchantLogoReferenceId(walletAddress))
      .catch((error) => {
        console.warn("The merchant logo provider reference is temporarily unavailable.", error);
        return null;
      });
    const [onchain, reference] = await Promise.all([
      this.metadataRegistry.getMerchantProfile(walletAddress),
      referencePromise,
    ]);
    return mergeMerchant(onchain, reference);
  }

  async saveProfile(walletAddress: string, input: MerchantProfileUpdate): Promise<Merchant> {
    const validated = merchantProfileUpdateSchema.parse(input);
    let onchain: Merchant | null;
    try {
      onchain = await this.metadataRegistry.getMerchantProfile(walletAddress);
    } catch (error) {
      throw new MerchantServiceError(
        `The on-chain profile could not be verified: ${error instanceof Error ? error.message : "Stellar RPC is unavailable."}`,
      );
    }
    if (!onchain || !profileMatchesChain(onchain, validated)) {
      throw new MerchantServiceError(
        "Approve and confirm the matching merchant profile on Stellar before saving its asset reference.",
      );
    }

    try {
      await this.profileEventIndex.indexLatest(walletAddress);
    } catch (error) {
      console.warn("The profile is on-chain, but its event index was not updated.", error);
    }

    let reference = await this.repositories.cloudinaryAssetReferences
      .findById(merchantLogoReferenceId(walletAddress))
      .catch(() => null);
    if (validated.logoUrl && validated.logoPublicId) {
      reference = {
        id: merchantLogoReferenceId(walletAddress),
        kind: "merchant_logo",
        ownerWalletAddress: walletAddress,
        resourceId: walletAddress,
        publicUrl: validated.logoUrl,
        publicId: validated.logoPublicId,
        sha256: validated.logoSha256,
        updatedAt: this.now().toISOString(),
      };
      try {
        await this.repositories.cloudinaryAssetReferences.save(reference);
      } catch (error) {
        console.warn("The profile is on-chain, but its Cloudinary reference was not updated.", error);
      }
    }
    return mergeMerchant(onchain, reference)!;
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
    if (!(await this.getProfile(walletAddress))) {
      throw new MerchantServiceError("Create your merchant profile before registering a campaign.");
    }

    let onchain: CampaignMetadata | null;
    try {
      onchain = await this.metadataRegistry.getCampaignMetadata(validated.campaignId);
    } catch (error) {
      throw new MerchantServiceError(
        `The on-chain campaign metadata could not be verified: ${error instanceof Error ? error.message : "Stellar RPC is unavailable."}`,
      );
    }
    if (!onchain || !campaignMetadataMatchesChain(onchain, walletAddress, validated)) {
      throw new MerchantServiceError(
        "Approve and confirm the matching campaign metadata on Stellar before saving its asset reference.",
      );
    }

    let reference = await this.repositories.cloudinaryAssetReferences
      .findById(campaignImageReferenceId(validated.campaignId))
      .catch(() => null);
    if (validated.imageUrl && validated.imagePublicId) {
      reference = {
        id: campaignImageReferenceId(validated.campaignId),
        kind: "campaign_image",
        ownerWalletAddress: walletAddress,
        resourceId: validated.campaignId,
        publicUrl: validated.imageUrl,
        publicId: validated.imagePublicId,
        sha256: validated.imageSha256,
        updatedAt: this.now().toISOString(),
      };
      try {
        await this.repositories.cloudinaryAssetReferences.save(reference);
      } catch (error) {
        console.warn("The campaign is on-chain, but its Cloudinary reference was not updated.", error);
      }
    }
    return mergeCampaignMetadata(onchain, reference);
  }

  async getDashboard(walletAddress: string): Promise<MerchantDashboardDto> {
    const [merchant, onchainMetadata] = await Promise.all([
      this.getProfile(walletAddress),
      this.metadataRegistry.getMerchantCampaigns(walletAddress),
    ]);
    const campaigns = await Promise.all(
      onchainMetadata.map(async (item): Promise<MerchantCampaignDto> => {
        const [campaign, reference] = await Promise.all([
          this.campaignReader.findById(item.id),
          this.repositories.cloudinaryAssetReferences
            .findById(campaignImageReferenceId(item.id))
            .catch((error) => {
              console.warn("A campaign image provider reference is unavailable.", error);
              return null;
            }),
        ]);
        if (!campaign) {
          throw new MerchantServiceError(`On-chain campaign ${item.id} is unavailable.`);
        }
        return {
          metadata: mergeCampaignMetadata(item, reference),
          onchain: toOnchainDto(campaign),
        };
      }),
    );
    campaigns.sort((left, right) => right.metadata.createdAt.localeCompare(left.metadata.createdAt));
    return { merchant, campaigns };
  }

  async getPublicCampaign(campaignId: string): Promise<PublicCampaignDto | null> {
    const [onchainMetadata, campaign, reference] = await Promise.all([
      this.metadataRegistry.getCampaignMetadata(campaignId),
      this.campaignReader.findById(campaignId),
      this.repositories.cloudinaryAssetReferences
        .findById(campaignImageReferenceId(campaignId))
        .catch((error) => {
          console.warn("The campaign image provider reference is unavailable.", error);
          return null;
        }),
    ]);
    if (!onchainMetadata || !campaign) return null;
    const merchant = await this.getProfile(onchainMetadata.merchantId);
    if (!merchant) return null;
    return {
      metadata: mergeCampaignMetadata(onchainMetadata, reference),
      merchant,
      onchain: toOnchainDto(campaign),
    };
  }
}
