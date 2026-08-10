import "server-only";

import { Address, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";

import type { StellarConfig } from "@/lib/stellar/config";
import type { ReviewReceipt } from "@/server/models";
import { readEventPages } from "@/server/stellar/customer-chain-reader";
import { resolveRetainedEventRange } from "@/server/stellar/event-retention";

function eventTopic(name: string): string {
  return xdr.ScVal.scvSymbol(name).toXDR("base64");
}

export class StellarReviewEventSource {
  private readonly server: rpc.Server;

  constructor(private readonly config: StellarConfig) {
    this.server = new rpc.Server(config.rpcUrl);
  }

  async readRetainedReceipts(): Promise<ReviewReceipt[]> {
    const filters: rpc.Api.EventFilter[] = [
      {
        type: "contract",
        contractIds: [this.config.reviewContractId],
        topics: [[eventTopic("review_submitted"), "**"]],
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
      if (
        topics[0] !== "review_submitted" ||
        typeof topics[1] !== "bigint" ||
        typeof topics[2] !== "string"
      ) {
        return [];
      }
      return [
        {
          id: topics[1].toString(),
          contractId: this.config.reviewContractId,
          reviewerWalletAddress: Address.fromString(topics[2]).toString(),
          transactionHash: event.txHash,
          ledger: event.ledger,
          createdAt: event.ledgerClosedAt,
        },
      ];
    });
  }
}
