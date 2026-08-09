import "server-only";

import type { Campaign } from "@/generated/wrenpass-contract/src";
import { getStellarConfig } from "@/lib/stellar/config";
import { readContractCampaign } from "@/lib/stellar/wrenpass-client";

const campaignIdPattern = /^[1-9]\d{0,19}$/;

export interface CampaignReader {
  findById(campaignId: string): Promise<Campaign | null>;
}

export class StellarCampaignReader implements CampaignReader {
  async findById(campaignId: string): Promise<Campaign | null> {
    if (!campaignIdPattern.test(campaignId)) return null;
    return readContractCampaign(getStellarConfig(), BigInt(campaignId));
  }
}
