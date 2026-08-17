import "server-only";

import { randomInt } from "node:crypto";

import type { Campaign } from "@/generated/wrenpass-contract/src";
import { getStellarConfig } from "@/lib/stellar/config";
import { readContractCampaign } from "@/lib/stellar/wrenpass-client";
import { syncConfirmedTransaction } from "@/server/events/service";
import type {
  EventSyncOptions,
  ExpectedTransaction,
} from "@/server/events/event-sync-service";
import {
  FirestoreOperationalStateStore,
  type OperationalStateStore,
} from "@/server/operations/operational-state-store";
import {
  getTestnetSimulatorConfig,
  type TestnetSimulatorConfig,
} from "@/server/simulator/config";
import {
  StellarTestnetSimulationExecutor,
  type TestnetSimulationExecutionResult,
  type TestnetSimulationExecutor,
} from "@/server/simulator/stellar-testnet-simulation-executor";

const RUN_WINDOW_MS = 55 * 60 * 1_000;
const FUNDING_INCREMENT = 100_000n;

interface EligibleCampaign {
  id: bigint;
  passPrice: bigint;
  remaining: number;
}

type RandomInteger = (minimum: number, maximumExclusive: number) => number;
type SynchronizeEvents = (
  expectedTransaction: ExpectedTransaction,
  options?: EventSyncOptions,
) => Promise<unknown>;

export type TestnetSimulationReservation =
  | { accepted: true; configurationWarnings?: readonly string[] }
  | {
      accepted: false;
      reason: "recently_started";
      retryAfterSeconds: number;
      configurationWarnings?: readonly string[];
    };

function randomBigIntInclusive(
  minimum: bigint,
  maximum: bigint,
  randomInteger: RandomInteger,
): bigint {
  const alignedMinimum = (
    (minimum + FUNDING_INCREMENT - 1n) / FUNDING_INCREMENT
  ) * FUNDING_INCREMENT;
  const alignedMaximum = (maximum / FUNDING_INCREMENT) * FUNDING_INCREMENT;
  const choices = (alignedMaximum - alignedMinimum) / FUNDING_INCREMENT + 1n;
  if (choices <= 0n || choices > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("The simulator funding range is unsupported.");
  }
  return alignedMinimum
    + BigInt(randomInteger(0, Number(choices))) * FUNDING_INCREMENT;
}

function eligibleCampaign(
  campaign: Campaign | null,
  config: TestnetSimulatorConfig,
  now: Date,
): EligibleCampaign | null {
  if (
    !campaign
    || campaign.status.tag !== "Active"
    || campaign.expires_at <= BigInt(Math.floor(now.getTime() / 1_000))
  ) {
    return null;
  }
  const remaining = campaign.max_supply - campaign.sold;
  if (
    remaining < config.minimumPurchases
    || campaign.pass_price * BigInt(config.minimumPurchases) > config.maximumFunding
  ) {
    return null;
  }
  return { id: campaign.id, passPrice: campaign.pass_price, remaining };
}

export class TestnetSimulationService {
  constructor(
    private readonly config: TestnetSimulatorConfig,
    private readonly store: OperationalStateStore,
    private readonly readCampaign: (campaignId: bigint) => Promise<Campaign | null>,
    private readonly executor: TestnetSimulationExecutor,
    private readonly synchronizeEvents: SynchronizeEvents,
    private readonly now: () => Date = () => new Date(),
    private readonly randomInteger: RandomInteger = randomInt,
  ) {}

  async reserveRun(): Promise<TestnetSimulationReservation> {
    const decision = await this.store.consumeRateLimits([
      {
        id: "testnet-purchase-simulator",
        limit: 1,
        windowMs: RUN_WINDOW_MS,
      },
    ], this.now());
    const configurationWarnings = this.config.configurationWarnings;
    return decision.allowed
      ? {
          accepted: true,
          ...(configurationWarnings?.length ? { configurationWarnings } : {}),
        }
      : {
          accepted: false,
          reason: "recently_started",
          retryAfterSeconds: decision.retryAfterSeconds,
          ...(configurationWarnings?.length ? { configurationWarnings } : {}),
        };
  }

  async run(origin: string): Promise<TestnetSimulationExecutionResult> {
    const now = this.now();
    const campaigns = await Promise.all(
      this.config.campaignIds.map((campaignId) => this.readCampaign(campaignId)),
    );
    const eligible = campaigns
      .map((campaign) => eligibleCampaign(campaign, this.config, now))
      .filter((campaign): campaign is EligibleCampaign => campaign !== null);
    if (eligible.length === 0) {
      throw new Error("No configured Testnet campaign is active, available, and affordable.");
    }

    const campaign = eligible[this.randomInteger(0, eligible.length)];
    const affordablePurchases = Number(this.config.maximumFunding / campaign.passPrice);
    const maximumPurchases = Math.min(
      this.config.maximumPurchases,
      campaign.remaining,
      affordablePurchases,
    );
    const purchaseCount = this.randomInteger(
      this.config.minimumPurchases,
      maximumPurchases + 1,
    );
    const purchaseCost = campaign.passPrice * BigInt(purchaseCount);
    const minimumFunding = purchaseCost > this.config.minimumFunding
      ? purchaseCost
      : this.config.minimumFunding;
    const fundingAmount = randomBigIntInclusive(
      minimumFunding,
      this.config.maximumFunding,
      this.randomInteger,
    );

    const result = await this.executor.execute({
      campaignId: campaign.id,
      fundingAmount,
      purchaseCount,
      origin,
    });
    for (const purchase of result.purchases) {
      await this.synchronizeEvents(
        {
          transactionHash: purchase.transactionHash,
          ledger: purchase.ledger,
          expectedEvent: {
            eventType: "pass_purchased",
            customer: result.walletAddress,
          },
        },
        { includeExpirationNotices: false },
      );
    }
    return result;
  }
}

let service: TestnetSimulationService | undefined;

export function getTestnetSimulationService(): TestnetSimulationService {
  if (!service) {
    const stellarConfig = getStellarConfig();
    service = new TestnetSimulationService(
      getTestnetSimulatorConfig(),
      new FirestoreOperationalStateStore(),
      (campaignId) => readContractCampaign(stellarConfig, campaignId),
      new StellarTestnetSimulationExecutor(stellarConfig),
      syncConfirmedTransaction,
    );
  }
  return service;
}
