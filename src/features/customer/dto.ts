import type { PublicCampaignDto } from "@/features/merchant/dto";

export type CustomerPassStatusDto = "Active" | "Redeemed" | "Expired" | "Refunded";
export type CustomerActivityKind = "Purchased" | "Gifted" | "Received" | "Redeemed" | "Refunded";

export interface CustomerPassDto {
  id: string;
  campaignId: string;
  owner: string;
  status: CustomerPassStatusDto;
  purchasedAt: string;
  purchaseAmounts: {
    total: string;
    merchantRelease: string;
    protectedReserve: string;
    platformFee: string;
  };
  campaign: PublicCampaignDto | null;
}

export interface CustomerActivityDto {
  id: string;
  kind: CustomerActivityKind;
  campaignId: string;
  passId: string;
  occurredAt: string;
  transactionHash: string;
  amount?: string;
  counterparty?: string;
}

export interface CustomerDashboardDto {
  passes: CustomerPassDto[];
  activity: CustomerActivityDto[];
  activityWindowStartsAt: string;
}
