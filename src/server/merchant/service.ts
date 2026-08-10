import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import { MerchantService } from "@/server/merchant/merchant-service";
import { createMetadataRegistryReader } from "@/server/merchant/metadata-registry-reader";
import { StellarCampaignReader } from "@/server/stellar/campaign-reader";

let merchantService: MerchantService | undefined;

export function getMerchantService(): MerchantService {
  const config = getStellarConfig();
  merchantService ??= new MerchantService(
    createOffchainRepositories(),
    new StellarCampaignReader(),
    config,
    createMetadataRegistryReader(config),
  );
  return merchantService;
}
