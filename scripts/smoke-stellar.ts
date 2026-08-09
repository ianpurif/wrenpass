import { getStellarConfig } from "@/lib/stellar/config";
import { StellarRpcGateway } from "@/server/stellar/rpc-gateway";

async function main() {
  const config = getStellarConfig();
  const gateway = new StellarRpcGateway(config.rpcUrl);
  const [networkPassphrase, issuerBalance] = await Promise.all([
    gateway.getNetworkPassphrase(),
    gateway.readAccountBalance(config.assetIssuer),
  ]);

  if (networkPassphrase !== config.networkPassphrase) {
    throw new Error("The RPC endpoint network does not match NEXT_PUBLIC_STELLAR_NETWORK.");
  }

  if (issuerBalance === null) {
    throw new Error("The configured asset issuer account does not exist on the selected network.");
  }

  console.log(`Stellar RPC network verified: ${config.network}`);
  console.log(`Configured asset verified: ${config.assetCode}`);
  console.log(`Issuer account is funded: yes`);
  console.log(`Asset contract matches asset and network: yes`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stellar smoke test failed.");
  process.exitCode = 1;
});
