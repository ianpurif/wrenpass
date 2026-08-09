import { getStellarConfig } from "@/lib/stellar/config";
import {
  readContractCampaignCount,
  readContractPassCount,
} from "@/lib/stellar/wrenpass-client";
import { createWrenPassLedgerKeys } from "@/server/stellar/ttl-service";

async function main() {
  const config = getStellarConfig();
  const [campaignCount, passCount] = await Promise.all([
    readContractCampaignCount(config),
    readContractPassCount(config),
  ]);
  const keys = createWrenPassLedgerKeys(
    config.wrenPassContractId,
    campaignCount,
    passCount,
  );
  const base = `stellar contract extend --id ${config.wrenPassContractId} --ledgers-to-extend 535679 --source-account REPLACE_WITH_KEEPER_IDENTITY --network ${config.network}`;

  console.log("Contract instance:");
  console.log(base);
  keys.slice(1).forEach((key, index) => {
    const label = index < Number(campaignCount)
      ? `Campaign #${index + 1}`
      : `Pass #${index - Number(campaignCount) + 1}`;
    console.log(`${label}:`);
    console.log(`${base} --key-xdr ${key.contractData().key().toXDR("base64")}`);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unable to plan Stellar TTL extension.");
  process.exitCode = 1;
});
