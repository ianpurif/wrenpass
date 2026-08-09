import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import { MerchantService } from "@/server/merchant/merchant-service";
import { StellarCampaignReader } from "@/server/stellar/campaign-reader";

let merchantService: MerchantService | undefined;

export function getMerchantService(): MerchantService {
  merchantService ??= new MerchantService(
    createOffchainRepositories(),
    new StellarCampaignReader(),
    getStellarConfig(),
  );
  return merchantService;
}
