import "server-only";

import { rpc, scValToNative, xdr } from "@stellar/stellar-sdk";

import type { StellarConfig } from "@/lib/stellar/config";
import { readEventPages } from "@/server/stellar/customer-chain-reader";
import { resolveRetainedEventRange } from "@/server/stellar/event-retention";

export interface WrenPassEvent {
  id: string;
  transactionHash: string;
  eventIndex: number;
  ledger: number;
  eventType:
    | "campaign_created"
    | "pass_purchased"
    | "pass_gifted"
    | "pass_redeemed"
    | "pass_refunded";
  campaignId: string;
  passId?: string;
  merchant?: string;
  customer?: string;
  previousOwner?: string;
  recipient?: string;
  owner?: string;
  payload: Record<string, unknown>;
}

export interface WrenPassEventSource {
  readRetainedEvents(): Promise<WrenPassEvent[]>;
}

const relevantEvents = [
  "campaign_created",
  "pass_purchased",
  "pass_gifted",
  "pass_redeemed",
  "pass_refunded",
] as const;

function eventTopic(name: string): string {
  return xdr.ScVal.scvSymbol(name).toXDR("base64");
}

function isRelevantEventName(
  value: string | undefined,
): value is (typeof relevantEvents)[number] {
  return relevantEvents.some((name) => name === value);
}

function normalize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, normalize(nested)]),
    );
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  const normalized = normalize(value);
  return typeof normalized === "object" && normalized !== null
    ? (normalized as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "bigint" ? String(value) : undefined;
}

function eventIndex(id: string): number {
  const value = Number(id.match(/(\d+)$/)?.[1]);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function decodeWrenPassEvent(event: rpc.Api.EventResponse): WrenPassEvent | null {
  const topics = event.topic.map((topic) => scValToNative(topic) as unknown);
  const eventType = asString(topics[0]);
  const campaignId = asString(topics[1]);
  if (!isRelevantEventName(eventType) || !campaignId) return null;

  const payload = asRecord(scValToNative(event.value));
  const base = {
    id: event.id,
    transactionHash: event.txHash,
    eventIndex: eventIndex(event.id),
    ledger: event.ledger,
    campaignId,
    payload,
  };

  if (eventType === "campaign_created") {
    return { ...base, eventType, merchant: asString(topics[2]) };
  }
  const passId = asString(topics[2]);
  if (!passId) return null;
  if (eventType === "pass_purchased") {
    return { ...base, eventType, passId, customer: asString(topics[3]) };
  }
  if (eventType === "pass_gifted") {
    return {
      ...base,
      eventType,
      passId,
      previousOwner: asString(topics[3]),
      recipient: asString(payload.recipient),
    };
  }
  if (eventType === "pass_redeemed") {
    return {
      ...base,
      eventType,
      passId,
      owner: asString(topics[3]),
      merchant: asString(payload.merchant),
    };
  }
  return { ...base, eventType, passId, owner: asString(topics[3]) };
}

export class StellarWrenPassEventSource implements WrenPassEventSource {
  private readonly server: rpc.Server;

  constructor(private readonly config: StellarConfig) {
    this.server = new rpc.Server(config.rpcUrl);
  }

  async readRetainedEvents(): Promise<WrenPassEvent[]> {
    const filters: rpc.Api.EventFilter[] = [
      {
        type: "contract",
        contractIds: [this.config.wrenPassContractId],
        topics: relevantEvents.map((name) => [eventTopic(name), "**"]),
      },
    ];
    const range = await resolveRetainedEventRange(this.server, filters);
    const response = await readEventPages(this.server, {
      ...range,
      filters,
      limit: 10_000,
    });
    return response.events
      .map(decodeWrenPassEvent)
      .filter((event): event is WrenPassEvent => event !== null)
      .sort((left, right) => left.ledger - right.ledger || left.id.localeCompare(right.id));
  }
}
