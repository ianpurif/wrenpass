import { campaignEventKey } from "@/server/campaign-transactions/campaign-event-key";
import type { IndexedBlockchainEvent } from "@/server/models";
import type { WrenPassEvent } from "@/server/events/event-source";

export type WalletReportBlockchainEvent = IndexedBlockchainEvent & {
  source: "indexed_cache" | "stellar_rpc_recovered";
};

function recoveredPayload(event: WrenPassEvent): Record<string, unknown> {
  return {
    ...event.payload,
    campaignId: event.campaignId,
    ...(event.passId ? { passId: event.passId } : {}),
    ...(event.customer ? { customer: event.customer } : {}),
    ...(event.merchant ? { merchant: event.merchant } : {}),
    ...(event.owner ? { owner: event.owner } : {}),
    ...(event.previousOwner ? { previousOwner: event.previousOwner } : {}),
    ...(event.recipient ? { recipient: event.recipient } : {}),
  };
}

export function mergeWalletReportEvents(input: {
  indexedEvents: IndexedBlockchainEvent[];
  retainedEvents: WrenPassEvent[];
  contractId: string;
  observedAt: string;
}): WalletReportBlockchainEvent[] {
  const events = new Map<string, WalletReportBlockchainEvent>(
    input.indexedEvents.map((event) => [event.id, { ...event, source: "indexed_cache" }]),
  );

  for (const event of input.retainedEvents) {
    if (events.has(event.id)) continue;
    events.set(event.id, {
      id: event.id,
      contractId: input.contractId,
      transactionHash: event.transactionHash,
      ...(event.eventType === "pass_purchased"
        ? { campaignEventKey: campaignEventKey(event.campaignId, event.id) }
        : {}),
      eventIndex: event.eventIndex,
      ledger: event.ledger,
      eventType: event.eventType,
      payload: recoveredPayload(event),
      indexedAt: input.observedAt,
      source: "stellar_rpc_recovered",
    });
  }

  return [...events.values()];
}
