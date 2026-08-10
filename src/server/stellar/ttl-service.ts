import "server-only";

import { Address, nativeToScVal, rpc, xdr } from "@stellar/stellar-sdk";

import type { StellarConfig } from "@/lib/stellar/config";

const LEDGER_ENTRY_BATCH_SIZE = 200;
export const MIN_SAFE_TTL_LEDGERS = 250_000;

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

async function assertLedgerKeysTtlReady(
  rpcUrl: string,
  keys: Iterable<xdr.LedgerKey>,
  entryLabel: string,
): Promise<{ entryCount: number; minimumRemainingLedgers: number }> {
  const server = new rpc.Server(rpcUrl);
  const latestLedger = await server.getLatestLedger();
  let entryCount = 0;
  let minimumRemainingLedgers = Number.POSITIVE_INFINITY;
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
    batch = [];
  };

  for (const key of keys) {
    batch.push(key);
    if (batch.length === LEDGER_ENTRY_BATCH_SIZE) await inspectBatch();
  }
  await inspectBatch();
  if (minimumRemainingLedgers < MIN_SAFE_TTL_LEDGERS) {
    throw new Error(
      `${entryLabel} TTL is below the ${MIN_SAFE_TTL_LEDGERS}-ledger release threshold. Extend the tracked entries before release.`,
    );
  }
  return { entryCount, minimumRemainingLedgers };
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
