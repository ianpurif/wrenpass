import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import {
  readContractCampaign,
  readContractPass,
  StellarRedemptionContractWriter,
} from "@/lib/stellar/wrenpass-client";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import { RedemptionService } from "@/server/redemption/redemption-service";

let redemptionService: RedemptionService | undefined;

export function getRedemptionService(): RedemptionService {
  if (!redemptionService) {
    const config = getStellarConfig();
    redemptionService = new RedemptionService(
      config,
      createOffchainRepositories(),
      {
        findPass: (passId) => readContractPass(config, passId),
        findCampaign: (campaignId) => readContractCampaign(config, campaignId),
      },
      new StellarRedemptionContractWriter(config),
    );
  }
  return redemptionService;
}
