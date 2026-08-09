import type { ContractConfig } from "@/generated/wrenpass-contract/src";
import type { StellarConfig } from "@/lib/stellar/config";

export interface PurchaseReadinessGateway {
  readAccountBalance(address: string): Promise<bigint | null>;
  readTrustlineBalance(
    address: string,
    asset: { code: string; issuer: string },
  ): Promise<bigint | null>;
}

export async function assertPurchaseDistributionReady(
  config: StellarConfig,
  contractConfig: ContractConfig,
  gateway: PurchaseReadinessGateway,
): Promise<void> {
  if (contractConfig.payment_asset !== config.assetContractId) {
    throw new Error(
      "The WrenPass contract payment asset does not match the configured Stellar asset.",
    );
  }

  if ((await gateway.readAccountBalance(contractConfig.platform)) === null) {
    throw new Error("The WrenPass platform fee account is not funded on the selected network.");
  }

  if (contractConfig.platform === config.assetIssuer) return;

  const platformTrustline = await gateway.readTrustlineBalance(contractConfig.platform, {
    code: config.assetCode,
    issuer: config.assetIssuer,
  });
  if (platformTrustline === null) {
    throw new Error(
      `The WrenPass platform fee account is missing the ${config.assetCode} trustline required for purchases.`,
    );
  }
}
