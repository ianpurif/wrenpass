import "server-only";

import { CampaignTransactionIndex } from "@/server/campaign-transactions/campaign-transaction-index";

let campaignTransactionIndex: CampaignTransactionIndex | undefined;

export function getCampaignTransactionIndex(): CampaignTransactionIndex {
  campaignTransactionIndex ??= new CampaignTransactionIndex();
  return campaignTransactionIndex;
}
