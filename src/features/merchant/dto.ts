import type { CampaignMetadata, Merchant } from "@/server/models";

export type CampaignStatusDto = "Draft" | "Active" | "Paused" | "Expired" | "Cancelled";

export interface OnchainCampaignDto {
  id: string;
  merchant: string;
  passPrice: string;
  serviceValue: string;
  maxSupply: number;
  sold: number;
  remaining: number;
  redeemed: number;
  refunded: number;
  merchantReleased: string;
  protectedFunds: string;
  platformFeesPaid: string;
  expiresAt: string;
  financialRules: {
    merchantBps: number;
    reserveBps: number;
    platformFeeBps: number;
  };
  status: CampaignStatusDto;
}

export interface MerchantCampaignDto {
  metadata: CampaignMetadata;
  onchain: OnchainCampaignDto;
}

export interface MerchantDashboardDto {
  merchant: Merchant | null;
  campaigns: MerchantCampaignDto[];
}

export interface PublicCampaignDto extends MerchantCampaignDto {
  merchant: Merchant;
}
