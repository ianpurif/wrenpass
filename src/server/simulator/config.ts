import "server-only";

import { z } from "zod";

import { parseUsdcAmount } from "@/features/merchant/campaign-terms";

const rawConfigSchema = z.object({
  TESTNET_SIMULATOR_MIN_USDC: z.string().trim().default("10"),
  TESTNET_SIMULATOR_MAX_USDC: z.string().trim().default("30"),
  TESTNET_SIMULATOR_MIN_PURCHASES: z.coerce.number().int().min(1).max(5).default(1),
  TESTNET_SIMULATOR_MAX_PURCHASES: z.coerce.number().int().min(1).max(5).default(3),
});

export interface TestnetSimulatorConfig {
  campaignIds: readonly bigint[];
  minimumFunding: bigint;
  maximumFunding: bigint;
  minimumPurchases: number;
  maximumPurchases: number;
}

export function parseTestnetSimulatorConfig(
  input: Record<string, string | undefined>,
): TestnetSimulatorConfig {
  const raw = rawConfigSchema.parse(input);
  const minimumFunding = parseUsdcAmount(raw.TESTNET_SIMULATOR_MIN_USDC);
  const maximumFunding = parseUsdcAmount(raw.TESTNET_SIMULATOR_MAX_USDC);

  if (minimumFunding > maximumFunding) {
    throw new Error("TESTNET_SIMULATOR_MIN_USDC must not exceed TESTNET_SIMULATOR_MAX_USDC.");
  }
  if (raw.TESTNET_SIMULATOR_MIN_PURCHASES > raw.TESTNET_SIMULATOR_MAX_PURCHASES) {
    throw new Error(
      "TESTNET_SIMULATOR_MIN_PURCHASES must not exceed TESTNET_SIMULATOR_MAX_PURCHASES.",
    );
  }

  return {
    campaignIds: [1n, 2n, 3n, 4n, 5n, 6n, 7n],
    minimumFunding,
    maximumFunding,
    minimumPurchases: raw.TESTNET_SIMULATOR_MIN_PURCHASES,
    maximumPurchases: raw.TESTNET_SIMULATOR_MAX_PURCHASES,
  };
}

export function getTestnetSimulatorConfig(): TestnetSimulatorConfig {
  return parseTestnetSimulatorConfig(process.env);
}
