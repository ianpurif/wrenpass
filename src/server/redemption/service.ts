import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import {
  readContractCampaign,
  readContractPass,
  StellarRedemptionContractWriter,
} from "@/lib/stellar/wrenpass-client";
import { getServerEnv } from "@/server/env";
import { StellarRedemptionRegistry } from "@/server/redemption/redemption-registry";
import { RedemptionService } from "@/server/redemption/redemption-service";

let redemptionService: RedemptionService | undefined;

export function getRedemptionService(): RedemptionService {
  if (!redemptionService) {
    const config = getStellarConfig();
    const registry = new StellarRedemptionRegistry(
      config,
      getServerEnv().STELLAR_REVIEW_SPONSOR_SECRET,
    );
    redemptionService = new RedemptionService(
      config,
      registry,
      {
        findPass: (passId) => readContractPass(config, passId),
        findCampaign: (campaignId) => readContractCampaign(config, campaignId),
      },
      new StellarRedemptionContractWriter(config),
    );
  }
  return redemptionService;
}
