// @vitest-environment node

import { describe, expect, it } from "vitest";

import { parseTestnetSimulatorConfig } from "@/server/simulator/config";

describe("parseTestnetSimulatorConfig", () => {
  it("uses conservative defaults without requiring a funding secret", () => {
    expect(parseTestnetSimulatorConfig({})).toEqual({
      campaignIds: [1n, 2n, 3n, 4n, 5n, 6n, 7n],
      minimumFunding: 100_000_000n,
      maximumFunding: 300_000_000n,
      minimumPurchases: 1,
      maximumPurchases: 3,
    });
  });

  it("accepts configurable funding and purchase ranges", () => {
    expect(parseTestnetSimulatorConfig({
      TESTNET_SIMULATOR_MIN_USDC: "12.5",
      TESTNET_SIMULATOR_MAX_USDC: "40",
      TESTNET_SIMULATOR_MIN_PURCHASES: "2",
      TESTNET_SIMULATOR_MAX_PURCHASES: "4",
    })).toMatchObject({
      minimumFunding: 125_000_000n,
      maximumFunding: 400_000_000n,
      minimumPurchases: 2,
      maximumPurchases: 4,
    });
  });

  it("caps an oversized maximum without disabling the scheduled run", () => {
    expect(parseTestnetSimulatorConfig({
      TESTNET_SIMULATOR_MAX_USDC: "1007",
      TESTNET_SIMULATOR_MIN_PURCHASES: "1",
      TESTNET_SIMULATOR_MAX_PURCHASES: "7",
    })).toMatchObject({
      maximumFunding: 1_000_000_000n,
      minimumPurchases: 1,
      maximumPurchases: 5,
      configurationWarnings: [
        "TESTNET_SIMULATOR_MAX_PURCHASES=7 exceeds the safety cap of 5; using 5.",
        "TESTNET_SIMULATOR_MAX_USDC=1007 exceeds the safety cap of 100 USDC; using 100 USDC.",
      ],
    });
  });

  it("reports invalid values as a clear simulator configuration error", () => {
    expect(() => parseTestnetSimulatorConfig({
      TESTNET_SIMULATOR_MAX_PURCHASES: "many",
    })).toThrow(
      "Invalid Testnet simulator configuration: TESTNET_SIMULATOR_MAX_PURCHASES",
    );
  });

  it("rejects reversed ranges", () => {
    expect(() => parseTestnetSimulatorConfig({
      TESTNET_SIMULATOR_MIN_USDC: "31",
      TESTNET_SIMULATOR_MAX_USDC: "30",
    })).toThrow(/MIN_USDC/);
    expect(() => parseTestnetSimulatorConfig({
      TESTNET_SIMULATOR_MIN_PURCHASES: "3",
      TESTNET_SIMULATOR_MAX_PURCHASES: "2",
    })).toThrow(/MIN_PURCHASES/);
  });

  it("rejects a minimum above the Testnet funding safety cap", () => {
    expect(() => parseTestnetSimulatorConfig({
      TESTNET_SIMULATOR_MIN_USDC: "101",
      TESTNET_SIMULATOR_MAX_USDC: "200",
    })).toThrow(/100 USDC safety cap/);
  });
});
