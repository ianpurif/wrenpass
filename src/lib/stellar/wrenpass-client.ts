import { Address, rpc, scValToNative } from "@stellar/stellar-sdk";
import type { ClientOptions } from "@stellar/stellar-sdk/contract";

import {
  Client,
  type Campaign,
  type CampaignTerms,
  type ContractConfig,
  type IndexMigrationStatus,
  type Pass,
} from "@/generated/wrenpass-contract/src";
import type { StellarConfig } from "@/lib/stellar/config";

type SignTransaction = NonNullable<ClientOptions["signTransaction"]>;
type SignAuthEntry = NonNullable<ClientOptions["signAuthEntry"]>;

const contractErrorMessages: Record<string, string> = {
  CampaignExpired: "This campaign has expired.",
  InsufficientBalance: "Your USDC balance is too low for this purchase.",
  InvalidPageSize: "The requested on-chain page size is not supported.",
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

export interface RedemptionTransactionDetails {
  passId: bigint;
  merchant: string;
  owner: string;
}

function inspectRedemptionTransaction(
  transaction: Awaited<ReturnType<Client["fromJSON"]["redeem_pass"]>>,
): RedemptionTransactionDetails {
  const built = transaction.built;
  if (!built || built.operations.length !== 1 || built.source === undefined) {
    throw new Error("The redemption transaction is incomplete.");
  }
  const operation = built.operations[0];
  if (operation.type !== "invokeHostFunction") {
    throw new Error("The redemption transaction has an unsupported operation.");
  }

  const invocation = operation.func.invokeContract();
  const contractId = Address.fromScAddress(invocation.contractAddress()).toString();
  const method = Buffer.from(invocation.functionName()).toString("utf8");
  if (contractId !== transaction.options.contractId || method !== "redeem_pass") {
    throw new Error("The redemption transaction targets the wrong contract action.");
  }

  const args = invocation.args().map((argument) => scValToNative(argument) as unknown);
  if (
    typeof args[0] !== "bigint" ||
    typeof args[1] !== "string" ||
    typeof args[2] !== "string"
  ) {
    throw new Error("The redemption transaction arguments are invalid.");
  }

  return { passId: args[0], merchant: args[1], owner: args[2] };
}

function expectAddressSet(actual: string[], expected: string[], message: string): void {
  if (actual.length !== expected.length || actual.some((value) => !expected.includes(value))) {
    throw new Error(message);
  }
}

export class StellarRedemptionContractWriter {
  constructor(private readonly config: StellarConfig) {}

  async prepareMerchantAuthorization(input: {
    passId: bigint;
    merchant: string;
    owner: string;
    signAuthEntry: SignAuthEntry;
  }): Promise<{ serializedTransaction: string; expiresAtLedger: number }> {
    const client = createClient(this.config, { publicKey: input.owner });
    const transaction = await client.redeem_pass({
      pass_id: input.passId,
      merchant: input.merchant,
      owner: input.owner,
    });
    expectAddressSet(
      transaction.needsNonInvokerSigningBy(),
      [input.merchant],
      "The contract did not request the expected merchant approval.",
    );

    const latestLedger = await new rpc.Server(this.config.rpcUrl).getLatestLedger();
    const expiresAtLedger = latestLedger.sequence + 60;
    await transaction.signAuthEntries({
      address: input.merchant,
      expiration: expiresAtLedger,
      signAuthEntry: input.signAuthEntry,
    });
    expectAddressSet(
      transaction.needsNonInvokerSigningBy({ includeAlreadySigned: true }),
      [input.merchant],
      "The prepared transaction contains an unexpected authorization signer.",
    );
    expectAddressSet(
      transaction.needsNonInvokerSigningBy(),
      [],
      "The merchant approval was not attached to the transaction.",
    );

    return { serializedTransaction: transaction.toJSON(), expiresAtLedger };
  }

  async verifyMerchantAuthorization(input: {
    serializedTransaction: string;
    passId: bigint;
    merchant: string;
    owner: string;
    expiresAtLedger: number;
  }): Promise<void> {
    const client = createClient(this.config, { publicKey: input.owner });
    const transaction = client.fromJSON.redeem_pass(input.serializedTransaction);
    const details = inspectRedemptionTransaction(transaction);
    if (
      transaction.built?.source !== input.owner ||
      details.passId !== input.passId ||
      details.merchant !== input.merchant ||
      details.owner !== input.owner
    ) {
      throw new Error("The prepared redemption does not match the requested pass.");
    }
    expectAddressSet(
      transaction.needsNonInvokerSigningBy({ includeAlreadySigned: true }),
      [input.merchant],
      "The prepared transaction was not authorized by the campaign merchant.",
    );
    expectAddressSet(
      transaction.needsNonInvokerSigningBy(),
      [],
      "The prepared transaction is missing merchant authorization.",
    );

    const latestLedger = await new rpc.Server(this.config.rpcUrl).getLatestLedger();
    if (input.expiresAtLedger <= latestLedger.sequence) {
      throw new Error("The merchant approval has expired. Scan the pass again.");
    }
    await transaction.simulate();
  }

  async approveAndSubmit(input: {
    serializedTransaction: string;
    owner: string;
    signTransaction: SignTransaction;
  }): Promise<{ transactionHash: string }> {
    const client = createClient(this.config, {
      publicKey: input.owner,
      signTransaction: input.signTransaction,
    });
    const transaction = client.fromJSON.redeem_pass(input.serializedTransaction);
    if (transaction.built?.source !== input.owner) {
      throw new Error("This redemption request belongs to a different pass owner.");
    }
    expectAddressSet(
      transaction.needsNonInvokerSigningBy(),
      [],
      "The campaign merchant has not approved this redemption.",
    );

    await transaction.simulate();
    const sent = await transaction.signAndSend();
    unwrapContractResult(sent.result);
    const transactionHash = sent.sendTransactionResponse?.hash;
    if (!transactionHash) throw new Error("Stellar accepted redemption without returning its hash.");
    return { transactionHash };
  }
}

export async function readContractCampaign(
  config: StellarConfig,
  campaignId: bigint,
): Promise<Campaign | null> {
  const transaction = await createClient(config).get_campaign({ campaign_id: campaignId });
  return transaction.result ?? null;
}

export async function readContractConfig(config: StellarConfig): Promise<ContractConfig> {
  const transaction = await createClient(config).get_config();
  return unwrapContractResult(transaction.result);
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

export async function readContractCampaignCount(config: StellarConfig): Promise<bigint> {
  const transaction = await createClient(config).campaign_count();
  return transaction.result;
}

export async function readContractStorageVersion(config: StellarConfig): Promise<number> {
  const transaction = await createClient(config).storage_version();
  return transaction.result;
}

export async function readContractIndexMigrationStatus(
  config: StellarConfig,
): Promise<IndexMigrationStatus> {
  const transaction = await createClient(config).index_migration_status();
  return transaction.result;
}

export async function readContractMerchantCampaignCount(
  config: StellarConfig,
  merchant: string,
): Promise<bigint> {
  const transaction = await createClient(config).merchant_campaign_count({ merchant });
  return transaction.result;
}

export async function readContractMerchantCampaigns(
  config: StellarConfig,
  merchant: string,
  cursor: bigint,
  limit: number,
): Promise<Campaign[]> {
  const transaction = await createClient(config).get_merchant_campaigns({
    merchant,
    cursor,
    limit,
  });
  return unwrapContractResult(transaction.result);
}

export async function readContractOwnerPassCount(
  config: StellarConfig,
  owner: string,
): Promise<bigint> {
  const transaction = await createClient(config).owner_pass_count({ owner });
  return transaction.result;
}

export async function readContractOwnerPasses(
  config: StellarConfig,
  owner: string,
  cursor: bigint,
  limit: number,
): Promise<Pass[]> {
  const transaction = await createClient(config).get_owner_passes({ owner, cursor, limit });
  return unwrapContractResult(transaction.result);
}
