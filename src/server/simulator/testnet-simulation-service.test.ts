// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type { Campaign } from "@/generated/wrenpass-contract/src";
import type { OperationalStateStore } from "@/server/operations/operational-state-store";
import type { TestnetSimulatorConfig } from "@/server/simulator/config";
import type { TestnetSimulationExecutor } from "@/server/simulator/stellar-testnet-simulation-executor";
import { TestnetSimulationService } from "@/server/simulator/testnet-simulation-service";

const NOW = new Date("2026-08-15T00:00:00.000Z");
const config: TestnetSimulatorConfig = {
  campaignIds: [1n, 2n, 3n, 4n, 5n, 6n, 7n],
  minimumFunding: 100_000_000n,
  maximumFunding: 300_000_000n,
  minimumPurchases: 1,
  maximumPurchases: 3,
};

function campaign(id: bigint, status: Campaign["status"] = { tag: "Active", values: undefined }): Campaign {
  return {
    id,
    merchant: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    platform: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    payment_asset: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
    pass_price: 50_000_000n,
    service_value: 60_000_000n,
    max_supply: 100,
    sold: 4,
    redeemed: 0,
    refunded: 0,
    expires_at: BigInt(Math.floor(NOW.getTime() / 1_000) + 86_400),
    created_at: 1n,
    merchant_released: 0n,
    protected_funds: 0n,
    platform_fees_paid: 0n,
    cancellation_shortfall: 0n,
    cancellation_funds: 0n,
    financial_rules: {
      merchant_bps: 7_900,
      reserve_bps: 2_000,
      platform_fee_bps: 100,
    },
    status,
  };
}

function store(decision = { allowed: true, retryAfterSeconds: 0 }): OperationalStateStore {
  return {
    readEventCursor: vi.fn(),
    advanceEventCursor: vi.fn(),
    tryAcquireLease: vi.fn(),
    releaseLease: vi.fn(),
    consumeRateLimits: vi.fn().mockResolvedValue(decision),
  };
}

const executionResult = {
  walletAddress: "GBUYER",
  campaignId: "4",
  fundingAmount: "300000000",
  xlmSwapMaximum: "200000000",
  swapTransactionHash: "swap-hash",
  walletSessionExpiresAt: "2026-08-16T00:00:00.000Z",
  purchases: [
    { passId: "10", transactionHash: "purchase-hash", ledger: 100 },
  ],
};

describe("TestnetSimulationService", () => {
  it("reports safe configuration adjustments when reserving a run", async () => {
    const service = new TestnetSimulationService(
      {
        ...config,
        maximumPurchases: 5,
        configurationWarnings: [
          "TESTNET_SIMULATOR_MAX_PURCHASES=7 exceeds the safety cap of 5; using 5.",
        ],
      },
      store(),
      vi.fn(),
      { execute: vi.fn() },
      vi.fn(),
      () => NOW,
    );

    await expect(service.reserveRun()).resolves.toEqual({
      accepted: true,
      configurationWarnings: [
        "TESTNET_SIMULATOR_MAX_PURCHASES=7 exceeds the safety cap of 5; using 5.",
      ],
    });
  });

  it("reserves one execution window to prevent overlap and duplicate runs", async () => {
    const operationalStore = store({ allowed: false, retryAfterSeconds: 900 });
    const service = new TestnetSimulationService(
      config,
      operationalStore,
      vi.fn(),
      { execute: vi.fn() },
      vi.fn(),
      () => NOW,
    );

    await expect(service.reserveRun()).resolves.toEqual({
      accepted: false,
      reason: "recently_started",
      retryAfterSeconds: 900,
    });
    expect(operationalStore.consumeRateLimits).toHaveBeenCalledWith([
      expect.objectContaining({ id: "testnet-purchase-simulator", limit: 1 }),
    ], NOW);
  });

  it("selects only viable campaigns and funds enough for randomized purchases", async () => {
    const active = campaign(4n);
    const readCampaign = vi.fn(async (id: bigint) =>
      id === 4n ? active : campaign(id, { tag: "Draft", values: undefined }));
    const executor: TestnetSimulationExecutor = {
      execute: vi.fn().mockResolvedValue(executionResult),
    };
    const synchronize = vi.fn().mockResolvedValue(undefined);
    const chooseUpperBound = vi.fn((minimum: number, maximumExclusive: number) =>
      maximumExclusive - 1);
    const service = new TestnetSimulationService(
      config,
      store(),
      readCampaign,
      executor,
      synchronize,
      () => NOW,
      chooseUpperBound,
    );

    await expect(service.run("https://wrenpass.vercel.app")).resolves.toEqual(executionResult);
    expect(executor.execute).toHaveBeenCalledWith({
      campaignId: 4n,
      purchaseCount: 3,
      fundingAmount: 300_000_000n,
      origin: "https://wrenpass.vercel.app",
    });
    expect(synchronize).toHaveBeenCalledWith(
      { transactionHash: "purchase-hash", ledger: 100 },
      { includeExpirationNotices: false },
    );
  });

  it("fails before creating a wallet when no configured campaign is viable", async () => {
    const executor: TestnetSimulationExecutor = { execute: vi.fn() };
    const service = new TestnetSimulationService(
      config,
      store(),
      vi.fn(async (id: bigint) => campaign(id, { tag: "Draft", values: undefined })),
      executor,
      vi.fn(),
      () => NOW,
    );

    await expect(service.run("https://wrenpass.vercel.app")).rejects.toThrow(
      /No configured Testnet campaign/,
    );
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("keeps confirmed purchases successful when event indexing is temporarily unavailable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const service = new TestnetSimulationService(
      { ...config, campaignIds: [1n] },
      store(),
      vi.fn().mockResolvedValue(campaign(1n)),
      { execute: vi.fn().mockResolvedValue(executionResult) },
      vi.fn().mockRejectedValue(new Error("index unavailable")),
      () => NOW,
      (minimum) => minimum,
    );

    await expect(service.run("https://wrenpass.vercel.app")).resolves.toEqual(executionResult);
    expect(consoleError).toHaveBeenCalledWith(
      "Testnet simulation purchases succeeded but event synchronization failed.",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
