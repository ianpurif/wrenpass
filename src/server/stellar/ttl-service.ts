import "server-only";

import {
  Address,
  BASE_FEE,
  Keypair,
  nativeToScVal,
  Operation,
  rpc,
  SorobanDataBuilder,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import type { StellarConfig } from "@/lib/stellar/config";

const LEDGER_ENTRY_BATCH_SIZE = 200;
const TTL_EXTENSION_BATCH_SIZE = 50;
const MAX_TESTNET_TTL_FEE_STROOPS = BigInt(100_000_000);
const MAX_MAINNET_TTL_FEE_STROOPS = BigInt(10_000_000);
const TESTNET_TTL_INCLUSION_FEE_STROOPS = "100000";
export const MIN_SAFE_TTL_LEDGERS = 250_000;
export const TARGET_TTL_LEDGERS = 500_000;

function contractDataKey(
  contractAddress: xdr.ScAddress,
  storageKey: xdr.ScVal,
): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: contractAddress,
      key: storageKey,
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
}

function enumStorageKey(name: "Campaign" | "Pass" | "Review", id: bigint): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol(name),
    nativeToScVal(id, { type: "u64" }),
  ]);
}

function metadataStorageKey(name: string, values: xdr.ScVal[]): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name), ...values]);
}

export function* iterateReviewLedgerKeys(
  contractId: string,
  reviewCount: bigint,
): Generator<xdr.LedgerKey> {
  if (reviewCount < BigInt(0)) {
    throw new Error("Review entry count cannot be negative.");
  }

  const contractAddress = Address.fromString(contractId).toScAddress();
  yield contractDataKey(contractAddress, xdr.ScVal.scvLedgerKeyContractInstance());
  for (let id = BigInt(1); id <= reviewCount; id += BigInt(1)) {
    yield contractDataKey(contractAddress, enumStorageKey("Review", id));
  }
}

export function createReviewLedgerKeys(
  contractId: string,
  reviewCount: bigint,
): xdr.LedgerKey[] {
  return [...iterateReviewLedgerKeys(contractId, reviewCount)];
}

export interface LedgerTtlInspection {
  entryCount: number;
  minimumRemainingLedgers: number;
  keysBelowThreshold: xdr.LedgerKey[];
}

export async function inspectLedgerKeysTtl(
  rpcUrl: string,
  keys: Iterable<xdr.LedgerKey>,
  entryLabel: string,
): Promise<LedgerTtlInspection> {
  const server = new rpc.Server(rpcUrl);
  const latestLedger = await server.getLatestLedger();
  let entryCount = 0;
  let minimumRemainingLedgers = Number.POSITIVE_INFINITY;
  const keysBelowThreshold: xdr.LedgerKey[] = [];
  let batch: xdr.LedgerKey[] = [];

  const inspectBatch = async () => {
    if (batch.length === 0) return;
    const response = await server.getLedgerEntries(...batch);
    if (response.entries.length !== batch.length) {
      throw new Error(`One or more ${entryLabel} entries are missing or archived.`);
    }
    if (response.entries.some((entry) => entry.liveUntilLedgerSeq === undefined)) {
      throw new Error(`Stellar RPC did not return TTL data for every ${entryLabel} entry.`);
    }
    entryCount += response.entries.length;
    minimumRemainingLedgers = Math.min(
      minimumRemainingLedgers,
      ...response.entries.map(
        (entry) => entry.liveUntilLedgerSeq! - latestLedger.sequence,
      ),
    );
    response.entries.forEach((entry, index) => {
      if (entry.liveUntilLedgerSeq! - latestLedger.sequence < MIN_SAFE_TTL_LEDGERS) {
        keysBelowThreshold.push(batch[index]!);
      }
    });
    batch = [];
  };

  for (const key of keys) {
    batch.push(key);
    if (batch.length === LEDGER_ENTRY_BATCH_SIZE) await inspectBatch();
  }
  await inspectBatch();
  return { entryCount, minimumRemainingLedgers, keysBelowThreshold };
}

async function assertLedgerKeysTtlReady(
  rpcUrl: string,
  keys: Iterable<xdr.LedgerKey>,
  entryLabel: string,
): Promise<{ entryCount: number; minimumRemainingLedgers: number }> {
  const inspection = await inspectLedgerKeysTtl(rpcUrl, keys, entryLabel);
  if (inspection.minimumRemainingLedgers < MIN_SAFE_TTL_LEDGERS) {
    throw new Error(
      `${entryLabel} TTL is below the ${MIN_SAFE_TTL_LEDGERS}-ledger release threshold. Extend the tracked entries before release.`,
    );
  }
  return {
    entryCount: inspection.entryCount,
    minimumRemainingLedgers: inspection.minimumRemainingLedgers,
  };
}

function transactionResultCode(response: rpc.Api.SendTransactionResponse): string {
  return response.errorResult?.result().switch().name ?? response.status;
}

export async function extendLedgerKeysTtl(input: {
  config: StellarConfig;
  sponsorSecret: string;
  keys: xdr.LedgerKey[];
}): Promise<string[]> {
  if (input.keys.length === 0) return [];
  const server = new rpc.Server(input.config.rpcUrl);
  const sponsor = Keypair.fromSecret(input.sponsorSecret);
  const feeLimit = input.config.network === "testnet"
    ? MAX_TESTNET_TTL_FEE_STROOPS
    : MAX_MAINNET_TTL_FEE_STROOPS;
  const transactionHashes: string[] = [];

  for (let cursor = 0; cursor < input.keys.length; cursor += TTL_EXTENSION_BATCH_SIZE) {
    const batch = input.keys.slice(cursor, cursor + TTL_EXTENSION_BATCH_SIZE);
    const account = await server.getAccount(sponsor.publicKey());
    const transaction = new TransactionBuilder(account, {
      fee: input.config.network === "testnet" ? TESTNET_TTL_INCLUSION_FEE_STROOPS : BASE_FEE,
      networkPassphrase: input.config.networkPassphrase,
    })
      .setSorobanData(new SorobanDataBuilder().setReadOnly(batch).build())
      .addOperation(Operation.extendFootprintTtl({ extendTo: TARGET_TTL_LEDGERS }))
      .setTimeout(60)
      .build();
    const prepared = await server.prepareTransaction(transaction);
    if (BigInt(prepared.fee) > feeLimit) {
      throw new Error(
        `The TTL maintenance fee (${prepared.fee} stroops) exceeded the ${feeLimit}-stroop safety limit.`,
      );
    }
    prepared.sign(sponsor);
    const sent = await server.sendTransaction(prepared);
    if (sent.status !== "PENDING" && sent.status !== "DUPLICATE") {
      throw new Error(`Stellar rejected TTL maintenance: ${transactionResultCode(sent)}.`);
    }
    const result = await server.pollTransaction(sent.hash, { attempts: 40 });
    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new Error(
        `Stellar TTL maintenance ended with ${result.status} for transaction ${sent.hash}.`,
      );
    }
    transactionHashes.push(sent.hash);
  }
  return transactionHashes;
}

export async function readContractCodeLedgerKey(
  rpcUrl: string,
  contractId: string,
): Promise<xdr.LedgerKey> {
  const server = new rpc.Server(rpcUrl);
  const instanceKey = contractDataKey(
    Address.fromString(contractId).toScAddress(),
    xdr.ScVal.scvLedgerKeyContractInstance(),
  );
  const response = await server.getLedgerEntries(instanceKey);
  const executable = response.entries[0]?.val.contractData().val().instance().executable();
  if (!executable || executable.switch().name !== "contractExecutableWasm") {
    throw new Error(`The Wasm code for contract ${contractId} is unavailable.`);
  }
  return xdr.LedgerKey.contractCode(
    new xdr.LedgerKeyContractCode({ hash: executable.wasmHash() }),
  );
}

export function* iterateWrenPassLedgerKeys(
  contractId: string,
  campaignCount: bigint,
  passCount: bigint,
): Generator<xdr.LedgerKey> {
  if (campaignCount < BigInt(0) || passCount < BigInt(0)) {
    throw new Error("Contract entry counts cannot be negative.");
  }

  const contractAddress = Address.fromString(contractId).toScAddress();
  yield contractDataKey(contractAddress, xdr.ScVal.scvLedgerKeyContractInstance());
  for (let id = BigInt(1); id <= campaignCount; id += BigInt(1)) {
    yield contractDataKey(contractAddress, enumStorageKey("Campaign", id));
  }
  for (let id = BigInt(1); id <= passCount; id += BigInt(1)) {
    yield contractDataKey(contractAddress, enumStorageKey("Pass", id));
  }
}

export function createWrenPassLedgerKeys(
  contractId: string,
  campaignCount: bigint,
  passCount: bigint,
): xdr.LedgerKey[] {
  return [...iterateWrenPassLedgerKeys(contractId, campaignCount, passCount)];
}

export interface MetadataMerchantIndex {
  merchant: string;
  campaignCount: bigint;
}

export function* iterateMetadataLedgerKeys(
  contractId: string,
  merchants: MetadataMerchantIndex[],
  campaignIds: bigint[],
): Generator<xdr.LedgerKey> {
  const contractAddress = Address.fromString(contractId).toScAddress();
  yield contractDataKey(contractAddress, xdr.ScVal.scvLedgerKeyContractInstance());

  for (const { merchant, campaignCount } of merchants) {
    if (campaignCount < BigInt(0)) {
      throw new Error("Metadata campaign count cannot be negative.");
    }
    const merchantValue = Address.fromString(merchant).toScVal();
    yield contractDataKey(
      contractAddress,
      metadataStorageKey("Merchant", [merchantValue]),
    );
    if (campaignCount > BigInt(0)) {
      yield contractDataKey(
        contractAddress,
        metadataStorageKey("MerchantCampaignCount", [merchantValue]),
      );
    }
    for (let slot = BigInt(0); slot < campaignCount; slot += BigInt(1)) {
      yield contractDataKey(
        contractAddress,
        metadataStorageKey("MerchantCampaign", [
          merchantValue,
          nativeToScVal(slot, { type: "u64" }),
        ]),
      );
    }
  }

  for (const campaignId of campaignIds) {
    if (campaignId <= BigInt(0)) {
      throw new Error("Metadata campaign IDs must be positive.");
    }
    const campaignValue = nativeToScVal(campaignId, { type: "u64" });
    yield contractDataKey(
      contractAddress,
      metadataStorageKey("Campaign", [campaignValue]),
    );
    yield contractDataKey(
      contractAddress,
      metadataStorageKey("CampaignIndex", [campaignValue]),
    );
  }
}

export function createMetadataLedgerKeys(
  contractId: string,
  merchants: MetadataMerchantIndex[],
  campaignIds: bigint[],
): xdr.LedgerKey[] {
  return [...iterateMetadataLedgerKeys(contractId, merchants, campaignIds)];
}

export function createRedemptionRegistryLedgerKeys(contractId: string): xdr.LedgerKey[] {
  const contractAddress = Address.fromString(contractId).toScAddress();
  return [
    contractDataKey(contractAddress, xdr.ScVal.scvLedgerKeyContractInstance()),
  ];
}

export function createCampaignPublisherLedgerKeys(contractId: string): xdr.LedgerKey[] {
  return createRedemptionRegistryLedgerKeys(contractId);
}

export async function assertWrenPassTtlReady(
  config: StellarConfig,
  campaignCount: bigint,
  passCount: bigint,
): Promise<{ entryCount: number; minimumRemainingLedgers: number }> {
  const keys = iterateWrenPassLedgerKeys(config.wrenPassContractId, campaignCount, passCount);
  return assertLedgerKeysTtlReady(config.rpcUrl, keys, "WrenPass contract");
}

export async function assertReviewTtlReady(
  config: StellarConfig,
  reviewCount: bigint,
): Promise<{ entryCount: number; minimumRemainingLedgers: number }> {
  return assertLedgerKeysTtlReady(
    config.rpcUrl,
    iterateReviewLedgerKeys(config.reviewContractId, reviewCount),
    "WrenPass review contract",
  );
}

export async function assertMetadataTtlReady(
  config: StellarConfig,
  merchants: MetadataMerchantIndex[],
  campaignIds: bigint[],
): Promise<{ entryCount: number; minimumRemainingLedgers: number }> {
  return assertLedgerKeysTtlReady(
    config.rpcUrl,
    iterateMetadataLedgerKeys(config.metadataContractId, merchants, campaignIds),
    "WrenPass metadata contract",
  );
}

export async function assertRedemptionRegistryTtlReady(
  config: StellarConfig,
): Promise<{ entryCount: number; minimumRemainingLedgers: number }> {
  return assertLedgerKeysTtlReady(
    config.rpcUrl,
    createRedemptionRegistryLedgerKeys(config.redemptionContractId),
    "WrenPass redemption registry",
  );
}

export async function assertCampaignPublisherTtlReady(
  config: StellarConfig,
): Promise<{ entryCount: number; minimumRemainingLedgers: number }> {
  if (!config.publisherContractId) {
    return { entryCount: 0, minimumRemainingLedgers: Number.POSITIVE_INFINITY };
  }
  return assertLedgerKeysTtlReady(
    config.rpcUrl,
    createCampaignPublisherLedgerKeys(config.publisherContractId),
    "WrenPass campaign publisher",
  );
}
