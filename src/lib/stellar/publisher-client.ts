import { Buffer } from "buffer";
import type { ClientOptions } from "@stellar/stellar-sdk/contract";

import {
  Client,
  type CampaignMetadataInput,
  type CampaignTerms,
} from "@/generated/publisher-contract/src";
import type { CampaignMetadataContractInput } from "@/lib/stellar/metadata-client";
import type { StellarConfig } from "@/lib/stellar/config";
import { submitWithFreshAccountSequence } from "@/lib/stellar/transaction-submission";

type SignTransaction = NonNullable<ClientOptions["signTransaction"]>;

function unwrapContractResult<T>(result: {
  isErr(): boolean;
  unwrap(): T;
  unwrapErr(): { message: string };
}): T {
  if (result.isErr()) {
    throw new Error(`Campaign publisher rejected the action: ${result.unwrapErr().message}`);
  }
  return result.unwrap();
}

function hashBuffer(value: string | undefined): Buffer | undefined {
  return value ? Buffer.from(value, "hex") : undefined;
}

export interface AtomicCampaignPublisher {
  createAndPublish(input: {
    merchant: string;
    terms: CampaignTerms;
    metadata: CampaignMetadataContractInput;
    signTransaction: SignTransaction;
  }): Promise<bigint>;
}

export class StellarCampaignPublisher implements AtomicCampaignPublisher {
  private readonly contractId: string;

  constructor(private readonly config: StellarConfig) {
    if (!config.publisherContractId) {
      throw new Error("The atomic campaign publisher is not configured.");
    }
    this.contractId = config.publisherContractId;
  }

  async createAndPublish(input: {
    merchant: string;
    terms: CampaignTerms;
    metadata: CampaignMetadataContractInput;
    signTransaction: SignTransaction;
  }): Promise<bigint> {
    const metadata: CampaignMetadataInput = {
      image_sha256: hashBuffer(input.metadata.imageSha256),
      image_url: input.metadata.imageUrl,
      name: input.metadata.name,
      service_description: input.metadata.serviceDescription,
    };

    return submitWithFreshAccountSequence({
      account: input.merchant,
      assembleSignAndSend: async () => {
        const client = new Client({
          contractId: this.contractId,
          networkPassphrase: this.config.networkPassphrase,
          rpcUrl: this.config.rpcUrl,
          publicKey: input.merchant,
          signTransaction: input.signTransaction,
        });
        const transaction = await client.create_and_publish_campaign({
          merchant: input.merchant,
          terms: input.terms,
          metadata,
        });
        const sent = await transaction.signAndSend();
        return unwrapContractResult(sent.result);
      },
    });
  }
}
