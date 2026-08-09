import "server-only";

import { rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import type { Pass } from "@/generated/wrenpass-contract/src";
import type { CustomerActivityDto } from "@/features/customer/dto";
import type { StellarConfig } from "@/lib/stellar/config";
import {
  readContractPass,
  readContractPassCount,
} from "@/lib/stellar/wrenpass-client";

interface ActivityWindow {
  activity: CustomerActivityDto[];
  startsAt: string;
}

interface EventPage {
  cursor: string;
  events: rpc.Api.EventResponse[];
  oldestLedgerCloseTime: string;
}

interface EventPageReader {
  getEvents(request: rpc.Api.GetEventsRequest): Promise<EventPage>;
}

const MAX_EVENT_PAGES = 25;

export interface CustomerChainReader {
  getPassCount(): Promise<bigint>;
  findPass(passId: bigint): Promise<Pass | null>;
  readRecentActivity(walletAddress: string): Promise<ActivityWindow>;
}

function eventTopic(name: string): string {
  return xdr.ScVal.scvSymbol(name).toXDR("base64");
}

export async function readEventPages(
  reader: EventPageReader,
  request: Extract<rpc.Api.GetEventsRequest, { startLedger: number }>,
): Promise<{ events: rpc.Api.EventResponse[]; oldestLedgerCloseTime: string }> {
  let page = await reader.getEvents(request);
  const oldestLedgerCloseTime = page.oldestLedgerCloseTime;
  const eventsById = new Map(page.events.map((event) => [event.id, event]));

  for (let pageNumber = 1; pageNumber <= MAX_EVENT_PAGES; pageNumber += 1) {
    const previousCursor = page.cursor;
    page = await reader.getEvents({
      cursor: previousCursor,
      filters: request.filters,
      limit: request.limit,
    });
    for (const event of page.events) eventsById.set(event.id, event);
    if (page.cursor === previousCursor) {
      return { events: [...eventsById.values()], oldestLedgerCloseTime };
    }
  }

  throw new Error("Stellar RPC event pagination exceeded the safe page limit.");
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

  async readRecentActivity(walletAddress: string): Promise<ActivityWindow> {
    const health = await this.server.getHealth();
    const safeRetentionWindow = Math.max(1, health.ledgerRetentionWindow - 100);
    const startLedger = Math.max(1, health.latestLedger - safeRetentionWindow);
    const response = await readEventPages(this.server, {
      startLedger,
      filters: [
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
      ],
      limit: 10_000,
    });

    return {
      activity: decodeCustomerActivity(response.events, walletAddress),
      startsAt: ledgerCloseTimeToIso(response.oldestLedgerCloseTime),
    };
  }
}
