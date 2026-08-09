import type { ClientOptions } from "@stellar/stellar-sdk/contract";

import {
  Client,
  type Campaign,
  type CampaignTerms,
} from "@/generated/wrenpass-contract/src";
import type { StellarConfig } from "@/lib/stellar/config";

type SignTransaction = NonNullable<ClientOptions["signTransaction"]>;

function createClient(
  config: StellarConfig,
  options: { publicKey?: string; signTransaction?: SignTransaction } = {},
) {
  return new Client({
    contractId: config.wrenPassContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    ...options,
  });
}

export interface CampaignContractWriter {
  createDraft(input: {
    merchant: string;
    terms: CampaignTerms;
    signTransaction: SignTransaction;
  }): Promise<bigint>;
  publish(input: {
    campaignId: bigint;
    merchant: string;
    signTransaction: SignTransaction;
  }): Promise<void>;
}

export class StellarCampaignContractWriter implements CampaignContractWriter {
  constructor(private readonly config: StellarConfig) {}

  async createDraft(input: {
    merchant: string;
    terms: CampaignTerms;
    signTransaction: SignTransaction;
  }): Promise<bigint> {
    const client = createClient(this.config, {
      publicKey: input.merchant,
      signTransaction: input.signTransaction,
    });
    const transaction = await client.create_campaign({
      merchant: input.merchant,
      terms: input.terms,
    });
    const sent = await transaction.signAndSend();
    return sent.result.unwrap();
  }

  async publish(input: {
    campaignId: bigint;
    merchant: string;
    signTransaction: SignTransaction;
  }): Promise<void> {
    const client = createClient(this.config, {
      publicKey: input.merchant,
      signTransaction: input.signTransaction,
    });
    const transaction = await client.publish_campaign({
      campaign_id: input.campaignId,
      merchant: input.merchant,
    });
    const sent = await transaction.signAndSend();
    sent.result.unwrap();
  }
}

export async function readContractCampaign(
  config: StellarConfig,
  campaignId: bigint,
): Promise<Campaign | null> {
  const transaction = await createClient(config).get_campaign({ campaign_id: campaignId });
  return transaction.result ?? null;
}
