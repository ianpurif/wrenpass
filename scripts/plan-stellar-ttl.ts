import { getStellarConfig } from "@/lib/stellar/config";
import { StellarMetadataContractReader } from "@/lib/stellar/metadata-client";
import { readContractReviewCount } from "@/lib/stellar/reviews-client";
import {
  readContractCampaignCount,
  readContractPassCount,
} from "@/lib/stellar/wrenpass-client";
import {
  iterateReviewLedgerKeys,
  iterateMetadataLedgerKeys,
  iterateWrenPassLedgerKeys,
  type MetadataMerchantIndex,
} from "@/server/stellar/ttl-service";
import { createOffchainRepositories } from "@/server/firestore/repositories";

async function main() {
  const config = getStellarConfig();
  const [campaignCount, passCount, reviewCount] = await Promise.all([
    readContractCampaignCount(config),
    readContractPassCount(config),
    readContractReviewCount(config),
  ]);
  const keys = iterateWrenPassLedgerKeys(
    config.wrenPassContractId,
    campaignCount,
    passCount,
  );
  const base = `stellar contract extend --id ${config.wrenPassContractId} --ledgers-to-extend 535679 --source-account REPLACE_WITH_KEEPER_IDENTITY --network ${config.network}`;

  console.log("Contract instance:");
  console.log(base);
  let entryIndex = BigInt(0);
  for (const key of keys) {
    if (entryIndex === BigInt(0)) {
      entryIndex += BigInt(1);
      continue;
    }
    const recordIndex = entryIndex - BigInt(1);
    const label = recordIndex < campaignCount
      ? `Campaign #${recordIndex + BigInt(1)}`
      : `Pass #${recordIndex - campaignCount + BigInt(1)}`;
    console.log(`${label}:`);
    console.log(`${base} --key-xdr ${key.contractData().key().toXDR("base64")}`);
    entryIndex += BigInt(1);
  }

  const reviewBase = `stellar contract extend --id ${config.reviewContractId} --ledgers-to-extend 535679 --source-account REPLACE_WITH_KEEPER_IDENTITY --network ${config.network}`;
  const reviewKeys = iterateReviewLedgerKeys(config.reviewContractId, reviewCount);
  console.log("Review contract instance:");
  console.log(reviewBase);
  let reviewIndex = BigInt(0);
  for (const key of reviewKeys) {
    if (reviewIndex === BigInt(0)) {
      reviewIndex += BigInt(1);
      continue;
    }
    console.log(`Review #${reviewIndex}:`);
    console.log(`${reviewBase} --key-xdr ${key.contractData().key().toXDR("base64")}`);
    reviewIndex += BigInt(1);
  }

  const metadataReader = new StellarMetadataContractReader(config);
  const metadataCampaignIds: bigint[] = [];
  const merchantCounts = new Map<string, bigint>();
  for (let campaignId = BigInt(1); campaignId <= campaignCount; campaignId += BigInt(1)) {
    const metadata = await metadataReader.getCampaignMetadata(campaignId);
    if (!metadata) throw new Error(`Campaign #${campaignId} is missing metadata.`);
    metadataCampaignIds.push(campaignId);
    merchantCounts.set(
      metadata.merchant,
      (merchantCounts.get(metadata.merchant) ?? BigInt(0)) + BigInt(1),
    );
  }
  const metadataMerchants: MetadataMerchantIndex[] = [...merchantCounts].map(
    ([merchant, campaignCountForMerchant]) => ({
      merchant,
      campaignCount: campaignCountForMerchant,
    }),
  );
  const profileLocators = await createOffchainRepositories()
    .metadataRegistryEntries.findByField("kind", "merchant_profile");
  for (const locator of profileLocators) {
    if (!merchantCounts.has(locator.ownerWalletAddress)) {
      metadataMerchants.push({
        merchant: locator.ownerWalletAddress,
        campaignCount: BigInt(0),
      });
    }
  }
  const metadataBase = `stellar contract extend --id ${config.metadataContractId} --ledgers-to-extend 535679 --source-account REPLACE_WITH_KEEPER_IDENTITY --network ${config.network}`;
  console.log("Metadata contract instance:");
  console.log(metadataBase);
  let metadataIndex = 0;
  for (const key of iterateMetadataLedgerKeys(
    config.metadataContractId,
    metadataMerchants,
    metadataCampaignIds,
  )) {
    if (metadataIndex > 0) {
      console.log(`Metadata entry #${metadataIndex}:`);
      console.log(`${metadataBase} --key-xdr ${key.contractData().key().toXDR("base64")}`);
    }
    metadataIndex += 1;
  }

  const redemptionBase = `stellar contract extend --id ${config.redemptionContractId} --ledgers-to-extend 535679 --source-account REPLACE_WITH_KEEPER_IDENTITY --network ${config.network}`;
  console.log("Redemption registry instance:");
  console.log(redemptionBase);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unable to plan Stellar TTL extension.");
  process.exitCode = 1;
});
