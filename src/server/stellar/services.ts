import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import { StellarBalanceService } from "@/server/stellar/balance-service";
import { StellarRpcGateway } from "@/server/stellar/rpc-gateway";

let balanceService: StellarBalanceService | undefined;

export function getStellarBalanceService(): StellarBalanceService {
  if (!balanceService) {
    const config = getStellarConfig();
    balanceService = new StellarBalanceService(
      {
        networkPassphrase: config.networkPassphrase,
        assetCode: config.assetCode,
        assetIssuer: config.assetIssuer,
      },
      new StellarRpcGateway(config.rpcUrl),
    );
  }

  return balanceService;
}
