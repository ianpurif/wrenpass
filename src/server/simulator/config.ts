import "server-only";

import { z } from "zod";

import { parseUsdcAmount } from "@/features/merchant/campaign-terms";

export const MAX_TESTNET_SIMULATOR_PURCHASES = 5;

const rawConfigSchema = z.object({
  TESTNET_SIMULATOR_MIN_USDC: z.string().trim().default("10"),
  TESTNET_SIMULATOR_MAX_USDC: z.string().trim().default("30"),
  TESTNET_SIMULATOR_MIN_PURCHASES: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_TESTNET_SIMULATOR_PURCHASES)
    .default(1),
  TESTNET_SIMULATOR_MAX_PURCHASES: z.coerce.number().int().min(1).default(3),
});

export interface TestnetSimulatorConfig {
  campaignIds: readonly bigint[];
  configurationWarnings?: readonly string[];
  minimumFunding: bigint;
  maximumFunding: bigint;
  minimumPurchases: number;
  maximumPurchases: number;
}

export class TestnetSimulatorConfigurationError extends Error {
  constructor(message: string) {
    super(`Invalid Testnet simulator configuration: ${message}`);
    this.name = "TestnetSimulatorConfigurationError";
  }
}

function parseFunding(name: string, value: string): bigint {
  try {
    return parseUsdcAmount(value);
  } catch (error) {
    throw new TestnetSimulatorConfigurationError(
      `${name}: ${error instanceof Error ? error.message : "invalid USDC amount"}`,
    );
  }
}

export function parseTestnetSimulatorConfig(
  input: Record<string, string | undefined>,
): TestnetSimulatorConfig {
  const parsed = rawConfigSchema.safeParse(input);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new TestnetSimulatorConfigurationError(problems);
  }

  const raw = parsed.data;
  const minimumFunding = parseFunding(
    "TESTNET_SIMULATOR_MIN_USDC",
    raw.TESTNET_SIMULATOR_MIN_USDC,
  );
  const maximumFunding = parseFunding(
    "TESTNET_SIMULATOR_MAX_USDC",
    raw.TESTNET_SIMULATOR_MAX_USDC,
  );
  const maximumPurchases = Math.min(
    raw.TESTNET_SIMULATOR_MAX_PURCHASES,
    MAX_TESTNET_SIMULATOR_PURCHASES,
  );
  const configurationWarnings = raw.TESTNET_SIMULATOR_MAX_PURCHASES > maximumPurchases
    ? [
        `TESTNET_SIMULATOR_MAX_PURCHASES=${raw.TESTNET_SIMULATOR_MAX_PURCHASES} exceeds the safety cap of ${MAX_TESTNET_SIMULATOR_PURCHASES}; using ${maximumPurchases}.`,
      ]
    : [];

  if (minimumFunding > maximumFunding) {
    throw new TestnetSimulatorConfigurationError(
      "TESTNET_SIMULATOR_MIN_USDC must not exceed TESTNET_SIMULATOR_MAX_USDC.",
    );
  }
  if (raw.TESTNET_SIMULATOR_MIN_PURCHASES > maximumPurchases) {
    throw new TestnetSimulatorConfigurationError(
      "TESTNET_SIMULATOR_MIN_PURCHASES must not exceed TESTNET_SIMULATOR_MAX_PURCHASES.",
    );
  }

  return {
    campaignIds: [1n, 2n, 3n, 4n, 5n, 6n, 7n],
    ...(configurationWarnings.length > 0 ? { configurationWarnings } : {}),
    minimumFunding,
    maximumFunding,
    minimumPurchases: raw.TESTNET_SIMULATOR_MIN_PURCHASES,
    maximumPurchases,
  };
}

export function getTestnetSimulatorConfig(): TestnetSimulatorConfig {
  const config = parseTestnetSimulatorConfig(process.env);
  for (const warning of config.configurationWarnings ?? []) {
    console.warn(`Testnet simulator configuration warning: ${warning}`);
  }
  return config;
}
