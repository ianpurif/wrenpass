import { Keypair } from "@stellar/stellar-sdk";

import { getStellarConfig } from "@/lib/stellar/config";
import { StellarMetadataContractReader } from "@/lib/stellar/metadata-client";
import { readContractReviewCount } from "@/lib/stellar/reviews-client";
import { Client as RedemptionsClient } from "@/generated/redemptions-contract/src";
import { getServerEnv } from "@/server/env";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import { MerchantProfileEventIndex } from "@/server/merchant/profile-event-index";
import {
  readContractCampaignCount,
  readContractConfig,
  readContractPassCount,
} from "@/lib/stellar/wrenpass-client";
import { assertPurchaseDistributionReady } from "@/server/stellar/purchase-readiness";
import { StellarRpcGateway } from "@/server/stellar/rpc-gateway";
import {
  assertMetadataTtlReady,
  assertRedemptionRegistryTtlReady,
  assertReviewTtlReady,
  assertWrenPassTtlReady,
  type MetadataMerchantIndex,
} from "@/server/stellar/ttl-service";

async function verifyMetadataRegistry(
  config: ReturnType<typeof getStellarConfig>,
  campaignCount: bigint,
): Promise<{ entryCount: number; minimumRemainingLedgers: number }> {
  const reader = new StellarMetadataContractReader(config);
  const [registryConfig, storageVersion] = await Promise.all([
    reader.getConfig(),
    reader.getStorageVersion(),
  ]);
  if (registryConfig.campaign_contract !== config.wrenPassContractId) {
    throw new Error("The metadata registry targets a different WrenPass campaign contract.");
  }
  if (storageVersion !== 1) {
    throw new Error(`Unsupported metadata registry storage version: ${storageVersion}.`);
  }

  const campaignIds: bigint[] = [];
  const campaignCounts = new Map<string, bigint>();
  for (let campaignId = BigInt(1); campaignId <= campaignCount; campaignId += BigInt(1)) {
    const metadata = await reader.getCampaignMetadata(campaignId);
    if (!metadata) {
      throw new Error(`Campaign #${campaignId} has not been migrated to the metadata registry.`);
    }
    campaignIds.push(campaignId);
    campaignCounts.set(
      metadata.merchant,
      (campaignCounts.get(metadata.merchant) ?? BigInt(0)) + BigInt(1),
    );
  }

  const merchants: MetadataMerchantIndex[] = [];
  const repositories = createOffchainRepositories();
  const profileMerchants = await new MerchantProfileEventIndex(
    config,
    repositories.indexedBlockchainEvents,
  ).listMerchantWallets();
  for (const merchant of profileMerchants) {
    if (!campaignCounts.has(merchant)) {
      campaignCounts.set(merchant, BigInt(0));
    }
  }
  for (const [merchant, merchantCampaignCount] of campaignCounts) {
    if (!(await reader.getMerchantProfile(merchant))) {
      throw new Error(`Merchant ${merchant} has no on-chain metadata profile.`);
    }
    const registeredCampaigns = await reader.getMerchantCampaigns(merchant);
    if (BigInt(registeredCampaigns.length) !== merchantCampaignCount) {
      throw new Error(`Merchant ${merchant} has an inconsistent metadata campaign index.`);
    }
    merchants.push({ merchant, campaignCount: merchantCampaignCount });
  }

  return assertMetadataTtlReady(config, merchants, campaignIds);
}

async function verifyRedemptionRegistry(
  config: ReturnType<typeof getStellarConfig>,
) {
  const client = new RedemptionsClient({
    contractId: config.redemptionContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
  });
  const [registryConfig, storageVersion] = await Promise.all([
    client.get_config(),
    client.storage_version(),
  ]);
  if (registryConfig.result.unwrap().campaign_contract !== config.wrenPassContractId) {
    throw new Error("The redemption registry targets a different campaign contract.");
  }
  if (storageVersion.result !== 1) {
    throw new Error(`Unsupported redemption registry storage version: ${storageVersion.result}.`);
  }
  return assertRedemptionRegistryTtlReady(config);
}

async function main() {
  const config = getStellarConfig();
  const reviewSponsor = Keypair.fromSecret(
    getServerEnv().STELLAR_REVIEW_SPONSOR_SECRET,
  ).publicKey();
  const gateway = new StellarRpcGateway(config.rpcUrl);
  const [
    networkPassphrase,
    issuerBalance,
    sponsorBalance,
    contractConfig,
    campaignCount,
    passCount,
    reviewCount,
  ] = await Promise.all([
    gateway.getNetworkPassphrase(),
    gateway.readAccountBalance(config.assetIssuer),
    gateway.readAccountBalance(reviewSponsor),
    readContractConfig(config),
    readContractCampaignCount(config),
    readContractPassCount(config),
    readContractReviewCount(config),
  ]);

  if (networkPassphrase !== config.networkPassphrase) {
    throw new Error("The RPC endpoint network does not match NEXT_PUBLIC_STELLAR_NETWORK.");
  }

  if (issuerBalance === null) {
    throw new Error("The configured asset issuer account does not exist on the selected network.");
  }

  if (sponsorBalance === null || sponsorBalance <= BigInt(10_000_000)) {
    throw new Error(
      "The review sponsor account must exist and hold more than 1 XLM on the selected network.",
    );
  }

  await assertPurchaseDistributionReady(config, contractConfig, gateway);
  const [ttl, reviewTtl, metadataTtl, redemptionTtl] = await Promise.all([
    assertWrenPassTtlReady(config, campaignCount, passCount),
    assertReviewTtlReady(config, reviewCount),
    verifyMetadataRegistry(config, campaignCount),
    verifyRedemptionRegistry(config),
  ]);

  console.log(`Stellar RPC network verified: ${config.network}`);
  console.log(`Configured asset verified: ${config.assetCode}`);
  console.log(`Issuer account is funded: yes`);
  console.log(`Review sponsor account is funded: yes`);
  console.log(`Asset contract matches asset and network: yes`);
  console.log(`WrenPass contract payment asset matches configuration: yes`);
  console.log(`Platform fee account can receive ${config.assetCode}: yes`);
  console.log(
    `WrenPass TTL verified: ${ttl.entryCount} entries, minimum ${ttl.minimumRemainingLedgers} ledgers remaining`,
  );
  console.log(
    `Review contract verified: ${reviewCount} reviews, ${reviewTtl.minimumRemainingLedgers} minimum ledgers remaining`,
  );
  console.log(
    `Metadata registry verified: ${metadataTtl.entryCount} entries, ${metadataTtl.minimumRemainingLedgers} minimum ledgers remaining`,
  );
  console.log(
    `Redemption registry verified: campaign target and storage v1, ${redemptionTtl.minimumRemainingLedgers} minimum ledgers remaining`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stellar smoke test failed.");
  process.exitCode = 1;
});
