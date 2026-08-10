import { Keypair } from "@stellar/stellar-sdk";

import { getStellarConfig } from "@/lib/stellar/config";
import { readContractReviewCount } from "@/lib/stellar/reviews-client";
import { getServerEnv } from "@/server/env";
import {
  readContractCampaignCount,
  readContractConfig,
  readContractPassCount,
} from "@/lib/stellar/wrenpass-client";
import { assertPurchaseDistributionReady } from "@/server/stellar/purchase-readiness";
import { StellarRpcGateway } from "@/server/stellar/rpc-gateway";
import { assertReviewTtlReady, assertWrenPassTtlReady } from "@/server/stellar/ttl-service";

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
  const [ttl, reviewTtl] = await Promise.all([
    assertWrenPassTtlReady(config, campaignCount, passCount),
    assertReviewTtlReady(config, reviewCount),
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
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stellar smoke test failed.");
  process.exitCode = 1;
});
