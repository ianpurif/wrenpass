import "server-only";

import { Address, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";

import type { StellarConfig } from "@/lib/stellar/config";
import type { MerchantProfileEventReference } from "@/server/merchant/profile-event-index";
import { readEventPages } from "@/server/stellar/customer-chain-reader";
import { resolveRetainedEventRange } from "@/server/stellar/event-retention";

function eventTopic(name: string): string {
  return xdr.ScVal.scvSymbol(name).toXDR("base64");
}

function eventIndexFromId(id: string): number {
  const value = Number(id.slice(id.lastIndexOf("-") + 1));
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export class StellarMetadataProfileEventSource {
  private readonly server: rpc.Server;

  constructor(private readonly config: StellarConfig) {
    this.server = new rpc.Server(config.rpcUrl);
  }

  async readRetainedReferences(): Promise<MerchantProfileEventReference[]> {
    const filters: rpc.Api.EventFilter[] = [
      {
        type: "contract",
        contractIds: [this.config.metadataContractId],
        topics: [[eventTopic("merchant_profile_set"), "**"]],
      },
    ];
    const range = await resolveRetainedEventRange(this.server, filters);
    const response = await readEventPages(this.server, {
      ...range,
      filters,
      limit: 10_000,
    });

    return response.events.flatMap((event) => {
      const topics = event.topic.map((topic) => scValToNative(topic) as unknown);
      if (topics[0] !== "merchant_profile_set" || typeof topics[1] !== "string") {
        return [];
      }
      return [
        {
          contractId: this.config.metadataContractId,
          merchantWalletAddress: Address.fromString(topics[1]).toString(),
          transactionHash: event.txHash,
          ledger: event.ledger,
          eventIndex: eventIndexFromId(event.id),
          occurredAt: event.ledgerClosedAt,
          sourceEventId: event.id,
        },
      ];
    });
  }
}
