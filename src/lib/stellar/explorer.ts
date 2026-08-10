import type { StellarNetwork } from "@/lib/stellar/config";

export function stellarTransactionUrl(
  network: StellarNetwork,
  transactionHash: string,
): string {
  return `https://stellar.expert/explorer/${network}/tx/${transactionHash}`;
}
