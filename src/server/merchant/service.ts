import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import { MerchantService } from "@/server/merchant/merchant-service";
import { createMetadataRegistryReader } from "@/server/merchant/metadata-registry-reader";
import { MerchantProfileEventIndex } from "@/server/merchant/profile-event-index";
import { StellarCampaignReader } from "@/server/stellar/campaign-reader";

let merchantService: MerchantService | undefined;
const dashboardRequests = new Map<string, Promise<Awaited<ReturnType<MerchantService["getDashboard"]>>>>();

export function getMerchantService(): MerchantService {
  const config = getStellarConfig();
  const repositories = createOffchainRepositories();
  merchantService ??= new MerchantService(
    repositories,
    new StellarCampaignReader(),
    config,
    createMetadataRegistryReader(config),
    new MerchantProfileEventIndex(
      config,
      repositories.indexedBlockchainEvents,
    ),
  );
  return merchantService;
}

export function getMerchantDashboard(walletAddress: string) {
  const existing = dashboardRequests.get(walletAddress);
  if (existing) return existing;

  const request = getMerchantService().getDashboard(walletAddress).finally(() => {
    if (dashboardRequests.get(walletAddress) === request) {
      dashboardRequests.delete(walletAddress);
    }
  });
  dashboardRequests.set(walletAddress, request);
  return request;
}
