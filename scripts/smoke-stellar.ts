import { getStellarConfig } from "@/lib/stellar/config";
import { readContractConfig } from "@/lib/stellar/wrenpass-client";
import { assertPurchaseDistributionReady } from "@/server/stellar/purchase-readiness";
import { StellarRpcGateway } from "@/server/stellar/rpc-gateway";

async function main() {
  const config = getStellarConfig();
  const gateway = new StellarRpcGateway(config.rpcUrl);
  const [networkPassphrase, issuerBalance, contractConfig] = await Promise.all([
    gateway.getNetworkPassphrase(),
    gateway.readAccountBalance(config.assetIssuer),
    readContractConfig(config),
  ]);

  if (networkPassphrase !== config.networkPassphrase) {
    throw new Error("The RPC endpoint network does not match NEXT_PUBLIC_STELLAR_NETWORK.");
  }

  if (issuerBalance === null) {
    throw new Error("The configured asset issuer account does not exist on the selected network.");
  }

  await assertPurchaseDistributionReady(config, contractConfig, gateway);

  console.log(`Stellar RPC network verified: ${config.network}`);
  console.log(`Configured asset verified: ${config.assetCode}`);
  console.log(`Issuer account is funded: yes`);
  console.log(`Asset contract matches asset and network: yes`);
  console.log(`WrenPass contract payment asset matches configuration: yes`);
  console.log(`Platform fee account can receive ${config.assetCode}: yes`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stellar smoke test failed.");
  process.exitCode = 1;
});
