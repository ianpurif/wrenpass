import { getStellarConfig } from "@/lib/stellar/config";
import { readContractReviewCount } from "@/lib/stellar/reviews-client";
import {
  readContractCampaignCount,
  readContractPassCount,
} from "@/lib/stellar/wrenpass-client";
import {
  iterateReviewLedgerKeys,
  iterateWrenPassLedgerKeys,
} from "@/server/stellar/ttl-service";

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
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unable to plan Stellar TTL extension.");
  process.exitCode = 1;
});
