import { formatUsdcAmount } from "@/features/merchant/campaign-terms";

export function displayUsdc(amount: string | bigint, assetCode = "USDC"): string {
  return `${formatUsdcAmount(typeof amount === "bigint" ? amount : BigInt(amount))} ${assetCode}`;
}

export function displayExpiration(epochSeconds: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(Number(epochSeconds) * 1_000));
}

export function shortenStellarAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}
