import "server-only";

import { Address, nativeToScVal, rpc, xdr } from "@stellar/stellar-sdk";

import type { StellarConfig } from "@/lib/stellar/config";

const MAX_TRACKED_ENTRIES = BigInt(2_000);
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

export function createReviewLedgerKeys(
  contractId: string,
  reviewCount: bigint,
): xdr.LedgerKey[] {
  if (reviewCount < BigInt(0)) {
    throw new Error("Review entry count cannot be negative.");
  }
  if (reviewCount > MAX_TRACKED_ENTRIES) {
    throw new Error("Review contract TTL validation exceeded its safe entry limit.");
  }

  const contractAddress = Address.fromString(contractId).toScAddress();
  const keys = [
    contractDataKey(contractAddress, xdr.ScVal.scvLedgerKeyContractInstance()),
  ];
  for (let id = BigInt(1); id <= reviewCount; id += BigInt(1)) {
    keys.push(contractDataKey(contractAddress, enumStorageKey("Review", id)));
  }
  return keys;
}

async function assertLedgerKeysTtlReady(
  rpcUrl: string,
  keys: xdr.LedgerKey[],
  entryLabel: string,
): Promise<{ entryCount: number; minimumRemainingLedgers: number }> {
  const server = new rpc.Server(rpcUrl);
  const latestLedger = await server.getLatestLedger();
  const entries = [];
  for (let index = 0; index < keys.length; index += LEDGER_ENTRY_BATCH_SIZE) {
    const response = await server.getLedgerEntries(
      ...keys.slice(index, index + LEDGER_ENTRY_BATCH_SIZE),
    );
    entries.push(...response.entries);
  }

  if (entries.length !== keys.length) {
    throw new Error(`One or more ${entryLabel} entries are missing or archived.`);
  }
  if (entries.some((entry) => entry.liveUntilLedgerSeq === undefined)) {
    throw new Error(`Stellar RPC did not return TTL data for every ${entryLabel} entry.`);
  }
  const minimumRemainingLedgers = Math.min(
    ...entries.map((entry) => entry.liveUntilLedgerSeq! - latestLedger.sequence),
  );
  if (minimumRemainingLedgers < MIN_SAFE_TTL_LEDGERS) {
    throw new Error(
      `${entryLabel} TTL is below the ${MIN_SAFE_TTL_LEDGERS}-ledger release threshold. Extend the tracked entries before release.`,
    );
  }
  return { entryCount: entries.length, minimumRemainingLedgers };
}

export function createWrenPassLedgerKeys(
  contractId: string,
  campaignCount: bigint,
  passCount: bigint,
): xdr.LedgerKey[] {
  if (campaignCount < BigInt(0) || passCount < BigInt(0)) {
    throw new Error("Contract entry counts cannot be negative.");
  }
  if (campaignCount + passCount > MAX_TRACKED_ENTRIES) {
    throw new Error("Contract TTL validation exceeded its safe entry limit.");
  }

  const contractAddress = Address.fromString(contractId).toScAddress();
  const keys = [
    contractDataKey(contractAddress, xdr.ScVal.scvLedgerKeyContractInstance()),
  ];
  for (let id = BigInt(1); id <= campaignCount; id += BigInt(1)) {
    keys.push(contractDataKey(contractAddress, enumStorageKey("Campaign", id)));
  }
  for (let id = BigInt(1); id <= passCount; id += BigInt(1)) {
    keys.push(contractDataKey(contractAddress, enumStorageKey("Pass", id)));
  }
  return keys;
}

export async function assertWrenPassTtlReady(
  config: StellarConfig,
  campaignCount: bigint,
  passCount: bigint,
): Promise<{ entryCount: number; minimumRemainingLedgers: number }> {
  const keys = createWrenPassLedgerKeys(
    config.wrenPassContractId,
    campaignCount,
    passCount,
  );
  return assertLedgerKeysTtlReady(config.rpcUrl, keys, "WrenPass contract");
}

export async function assertReviewTtlReady(
  config: StellarConfig,
  reviewCount: bigint,
): Promise<{ entryCount: number; minimumRemainingLedgers: number }> {
  return assertLedgerKeysTtlReady(
    config.rpcUrl,
    createReviewLedgerKeys(config.reviewContractId, reviewCount),
    "WrenPass review contract",
  );
}
