import "server-only";

import { rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import type { Pass } from "@/generated/wrenpass-contract/src";
import type { CustomerActivityDto } from "@/features/customer/dto";
import type { StellarConfig } from "@/lib/stellar/config";
import {
  resolveRetainedEventRange,
  retryStartLedgerFromRangeError,
} from "@/server/stellar/event-retention";
import {
  readContractIndexMigrationStatus,
  readContractOwnerPassCount,
  readContractOwnerPasses,
  readContractPass,
  readContractPassCount,
} from "@/lib/stellar/wrenpass-client";

interface ActivityWindow {
  activity: CustomerActivityDto[];
  startsAt: string;
}

interface EventPage {
  events: rpc.Api.EventResponse[];
  oldestLedgerCloseTime: string;
}

interface EventPageReader {
  getEvents(request: rpc.Api.GetEventsRequest): Promise<EventPage>;
}

const EVENT_LEDGER_BATCH_SIZE = 10_000;
const MAX_EVENT_PAGES = 25;
const MAX_EVENT_RANGE_RETRIES = 2;
const OWNER_PASS_PAGE_SIZE = 50;
const MAX_DIRECT_PASS_READS = BigInt(2_000);
const LEGACY_PASS_READ_BATCH_SIZE = 20;

export interface CustomerChainReader {
  getOwnedPasses(walletAddress: string): Promise<Pass[]>;
  getPassCount(): Promise<bigint>;
  findPass(passId: bigint): Promise<Pass | null>;
  readRecentActivity(walletAddress: string): Promise<ActivityWindow>;
}

interface OwnerPassIndexReader {
  getMigrationStatus(): Promise<{ passes_complete: boolean }>;
  getOwnerPassCount(owner: string): Promise<bigint>;
  getOwnerPasses(owner: string, cursor: bigint, limit: number): Promise<Pass[]>;
  getPassCount(): Promise<bigint>;
  findPass(passId: bigint): Promise<Pass | null>;
}

export async function readOwnedPasses(
  reader: OwnerPassIndexReader,
  walletAddress: string,
): Promise<Pass[]> {
  const migrationStatus = await reader.getMigrationStatus();
  if (migrationStatus.passes_complete) {
    const count = await reader.getOwnerPassCount(walletAddress);
    const cursors: bigint[] = [];
    for (let cursor = BigInt(0); cursor < count; cursor += BigInt(OWNER_PASS_PAGE_SIZE)) {
      cursors.push(cursor);
    }
    const pages = await Promise.all(
      cursors.map((cursor) =>
        reader.getOwnerPasses(
          walletAddress,
          cursor,
          OWNER_PASS_PAGE_SIZE,
        ),
      ),
    );
    return pages.flat();
  }

  const passCount = await reader.getPassCount();
  if (passCount > MAX_DIRECT_PASS_READS) {
    throw new Error(
      "The pass ownership index is still migrating and the legacy reader reached its safe limit.",
    );
  }
  const ownedPasses: Pass[] = [];
  for (let start = 1; start <= Number(passCount); start += LEGACY_PASS_READ_BATCH_SIZE) {
    const end = Math.min(Number(passCount), start + LEGACY_PASS_READ_BATCH_SIZE - 1);
    const passes = await Promise.all(
      Array.from({ length: end - start + 1 }, (_, index) =>
        reader.findPass(BigInt(start + index)),
      ),
    );
    ownedPasses.push(...passes.filter(
      (pass): pass is Pass => pass !== null && pass.owner === walletAddress,
    ));
  }
  return ownedPasses;
}

function eventTopic(name: string): string {
  return xdr.ScVal.scvSymbol(name).toXDR("base64");
}

export async function readEventPages(
  reader: EventPageReader,
  request: Extract<rpc.Api.GetEventsRequest, { startLedger: number }> & { endLedger: number },
): Promise<{ events: rpc.Api.EventResponse[]; oldestLedgerCloseTime: string }> {
  const eventsById = new Map<string, rpc.Api.EventResponse>();
  let oldestLedgerCloseTime: string | null = null;
  let nextLedger = request.startLedger;
  let pageCount = 0;
  let rangeRetries = 0;

  while (nextLedger <= request.endLedger) {
    if (pageCount >= MAX_EVENT_PAGES) {
      throw new Error("Stellar RPC event scan exceeded the safe page limit.");
    }
    const endLedgerExclusive = Math.min(
      request.endLedger + 1,
      nextLedger + EVENT_LEDGER_BATCH_SIZE,
    );

    let page: EventPage;
    try {
      page = await reader.getEvents({
        startLedger: nextLedger,
        endLedger: endLedgerExclusive,
        filters: request.filters,
        limit: request.limit,
      });
    } catch (error) {
      const retryStartLedger = retryStartLedgerFromRangeError(error);
      if (
        retryStartLedger === null ||
        retryStartLedger <= nextLedger ||
        rangeRetries === MAX_EVENT_RANGE_RETRIES
      ) {
        throw error;
      }
      nextLedger = retryStartLedger;
      rangeRetries += 1;
      continue;
    }
    oldestLedgerCloseTime ??= page.oldestLedgerCloseTime;
    for (const event of page.events) eventsById.set(event.id, event);
    if (request.limit !== undefined && page.events.length >= request.limit) {
      throw new Error("Stellar RPC event density exceeded the safe range limit.");
    }
    nextLedger = endLedgerExclusive;
    pageCount += 1;
    rangeRetries = 0;
  }

  if (!oldestLedgerCloseTime) {
    throw new Error("Stellar RPC did not return an event range.");
  }
  return { events: [...eventsById.values()], oldestLedgerCloseTime };
}

function toBigInt(value: unknown): bigint | null {
  return typeof value === "bigint" ? value : null;
}

function toAddress(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function ledgerCloseTimeToIso(value: string): string {
  const numericSeconds = Number(value);
  const date = Number.isFinite(numericSeconds)
    ? new Date(numericSeconds * 1_000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Stellar RPC returned an invalid ledger close time.");
  }
  return date.toISOString();
}

export function decodeCustomerActivity(
  events: Awaited<ReturnType<rpc.Server["getEvents"]>>["events"],
  walletAddress: string,
): CustomerActivityDto[] {
  const activity: CustomerActivityDto[] = [];

  for (const event of events) {
    const topics = event.topic.map((topic) => scValToNative(topic) as unknown);
    const name = topics[0];
    const campaignId = toBigInt(topics[1]);
    const passId = toBigInt(topics[2]);
    if (typeof name !== "string" || campaignId === null || passId === null) continue;

    if (name === "pass_purchased") {
      const customer = toAddress(topics[3]);
      const values = toRecord(scValToNative(event.value));
      const total = values ? toBigInt(values.total) : null;
      if (customer !== walletAddress || total === null) continue;
      activity.push({
        id: event.id,
        kind: "Purchased",
        campaignId: campaignId.toString(),
        passId: passId.toString(),
        occurredAt: event.ledgerClosedAt,
        transactionHash: event.txHash,
        amount: total.toString(),
      });
      continue;
    }

    if (name === "pass_gifted") {
      const previousOwner = toAddress(topics[3]);
      const values = toRecord(scValToNative(event.value));
      const recipient = values ? toAddress(values.recipient) : null;
      if (!previousOwner || !recipient) continue;
      if (previousOwner === walletAddress) {
        activity.push({
          id: event.id,
          kind: "Gifted",
          campaignId: campaignId.toString(),
          passId: passId.toString(),
          occurredAt: event.ledgerClosedAt,
          transactionHash: event.txHash,
          counterparty: recipient,
        });
      } else if (recipient === walletAddress) {
        activity.push({
          id: event.id,
          kind: "Received",
          campaignId: campaignId.toString(),
          passId: passId.toString(),
          occurredAt: event.ledgerClosedAt,
          transactionHash: event.txHash,
          counterparty: previousOwner,
        });
      }
      continue;
    }

    if (name === "pass_redeemed" || name === "pass_refunded") {
      const owner = toAddress(topics[3]);
      if (owner !== walletAddress) continue;
      activity.push({
        id: event.id,
        kind: name === "pass_redeemed" ? "Redeemed" : "Refunded",
        campaignId: campaignId.toString(),
        passId: passId.toString(),
        occurredAt: event.ledgerClosedAt,
        transactionHash: event.txHash,
      });
    }
  }

  return activity.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

export class StellarCustomerChainReader implements CustomerChainReader {
  private readonly server: rpc.Server;

  constructor(private readonly config: StellarConfig) {
    this.server = new rpc.Server(config.rpcUrl);
  }

  getPassCount(): Promise<bigint> {
    return readContractPassCount(this.config);
  }

  findPass(passId: bigint): Promise<Pass | null> {
    return readContractPass(this.config, passId);
  }

  getOwnedPasses(walletAddress: string): Promise<Pass[]> {
    return readOwnedPasses(
      {
        getMigrationStatus: () => readContractIndexMigrationStatus(this.config),
        getOwnerPassCount: (owner) => readContractOwnerPassCount(this.config, owner),
        getOwnerPasses: (owner, cursor, limit) =>
          readContractOwnerPasses(this.config, owner, cursor, limit),
        getPassCount: () => this.getPassCount(),
        findPass: (passId) => this.findPass(passId),
      },
      walletAddress,
    );
  }

  async readRecentActivity(walletAddress: string): Promise<ActivityWindow> {
    const filters: rpc.Api.EventFilter[] = [
      {
        type: "contract",
        contractIds: [this.config.wrenPassContractId],
        topics: [
          [eventTopic("pass_purchased"), "**"],
          [eventTopic("pass_gifted"), "**"],
          [eventTopic("pass_redeemed"), "**"],
          [eventTopic("pass_refunded"), "**"],
        ],
      },
    ];
    const range = await resolveRetainedEventRange(this.server, filters);
    const response = await readEventPages(this.server, {
      ...range,
      filters,
      limit: 10_000,
    });

    return {
      activity: decodeCustomerActivity(response.events, walletAddress),
      startsAt: ledgerCloseTimeToIso(response.oldestLedgerCloseTime),
    };
  }
}
