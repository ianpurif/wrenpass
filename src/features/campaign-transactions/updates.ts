import type { CampaignTransactionDto } from "@/features/campaign-transactions/dto";

const CAMPAIGN_PURCHASE_CONFIRMED_EVENT = "wrenpass:campaign-purchase-confirmed";

export interface CampaignPurchaseConfirmedDetail {
  campaignId: string;
  transaction: CampaignTransactionDto;
}

export function announceCampaignPurchase(
  detail: CampaignPurchaseConfirmedDetail,
): void {
  window.dispatchEvent(
    new CustomEvent<CampaignPurchaseConfirmedDetail>(
      CAMPAIGN_PURCHASE_CONFIRMED_EVENT,
      { detail },
    ),
  );
}

export function subscribeToCampaignPurchases(
  listener: (detail: CampaignPurchaseConfirmedDetail) => void,
): () => void {
  const handlePurchase = (event: Event) => {
    listener((event as CustomEvent<CampaignPurchaseConfirmedDetail>).detail);
  };
  window.addEventListener(CAMPAIGN_PURCHASE_CONFIRMED_EVENT, handlePurchase);
  return () => {
    window.removeEventListener(CAMPAIGN_PURCHASE_CONFIRMED_EVENT, handlePurchase);
  };
}
