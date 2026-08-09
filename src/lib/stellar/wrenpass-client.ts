import type { ClientOptions } from "@stellar/stellar-sdk/contract";

import {
  Client,
  type Campaign,
  type CampaignTerms,
  type Pass,
} from "@/generated/wrenpass-contract/src";
import type { StellarConfig } from "@/lib/stellar/config";

type SignTransaction = NonNullable<ClientOptions["signTransaction"]>;

const contractErrorMessages: Record<string, string> = {
  CampaignExpired: "This campaign has expired.",
  InsufficientBalance: "Your USDC balance is too low for this purchase.",
  InvalidRecipient: "Choose a different recipient wallet.",
  InvalidState: "This action is not available in the campaign's current state.",
  PassExpired: "This pass has expired and cannot be gifted.",
  PassNotActive: "Only an active pass can be gifted.",
  SoldOut: "This campaign is sold out.",
  Unauthorized: "The connected wallet is not authorized for this action.",
};

function unwrapContractResult<T>(result: {
  isErr(): boolean;
  unwrap(): T;
  unwrapErr(): { message: string };
}): T {
  if (result.isErr()) {
    const contractMessage = result.unwrapErr().message;
    throw new Error(contractErrorMessages[contractMessage] ?? `Contract rejected the action: ${contractMessage}`);
  }
  return result.unwrap();
}

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
    return unwrapContractResult(sent.result);
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
    unwrapContractResult(sent.result);
  }
}

export interface CustomerContractWriter {
  purchase(input: {
    campaignId: bigint;
    customer: string;
    signTransaction: SignTransaction;
  }): Promise<bigint>;
  gift(input: {
    passId: bigint;
    owner: string;
    recipient: string;
    signTransaction: SignTransaction;
  }): Promise<void>;
}

export class StellarCustomerContractWriter implements CustomerContractWriter {
  constructor(private readonly config: StellarConfig) {}

  async purchase(input: {
    campaignId: bigint;
    customer: string;
    signTransaction: SignTransaction;
  }): Promise<bigint> {
    const client = createClient(this.config, {
      publicKey: input.customer,
      signTransaction: input.signTransaction,
    });
    const transaction = await client.purchase({
      campaign_id: input.campaignId,
      customer: input.customer,
    });
    const sent = await transaction.signAndSend();
    return unwrapContractResult(sent.result);
  }

  async gift(input: {
    passId: bigint;
    owner: string;
    recipient: string;
    signTransaction: SignTransaction;
  }): Promise<void> {
    const client = createClient(this.config, {
      publicKey: input.owner,
      signTransaction: input.signTransaction,
    });
    const transaction = await client.gift_pass({
      pass_id: input.passId,
      owner: input.owner,
      recipient: input.recipient,
    });
    const sent = await transaction.signAndSend();
    unwrapContractResult(sent.result);
  }
}

export async function readContractCampaign(
  config: StellarConfig,
  campaignId: bigint,
): Promise<Campaign | null> {
  const transaction = await createClient(config).get_campaign({ campaign_id: campaignId });
  return transaction.result ?? null;
}

export async function readContractPass(
  config: StellarConfig,
  passId: bigint,
): Promise<Pass | null> {
  const transaction = await createClient(config).get_pass({ pass_id: passId });
  return transaction.result ?? null;
}

export async function readContractPassCount(config: StellarConfig): Promise<bigint> {
  const transaction = await createClient(config).pass_count();
  return transaction.result;
}
