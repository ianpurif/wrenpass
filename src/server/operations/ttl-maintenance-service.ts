import "server-only";

import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";

import { Client as MetadataClient } from "@/generated/metadata-contract/src";
import { Client as WrenPassClient } from "@/generated/wrenpass-contract/src";
import { StellarMetadataContractReader } from "@/lib/stellar/metadata-client";
import { readContractReviewCount } from "@/lib/stellar/reviews-client";
import type { StellarConfig } from "@/lib/stellar/config";
import {
  readContractCampaign,
  readContractCampaignCount,
  readContractPassCount,
} from "@/lib/stellar/wrenpass-client";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import { MerchantProfileEventIndex } from "@/server/merchant/profile-event-index";
import {
  createMetadataLedgerKeys,
  createCampaignPublisherLedgerKeys,
  createRedemptionRegistryLedgerKeys,
  createReviewLedgerKeys,
  createWrenPassLedgerKeys,
  extendLedgerKeysTtl,
  inspectLedgerKeysTtl,
  readContractCodeLedgerKey,
  type MetadataMerchantIndex,
} from "@/server/stellar/ttl-service";

const CONTRACT_MAINTENANCE_PAGE_SIZE = 50;
const MAX_MAINTENANCE_FEE_STROOPS = BigInt(10_000_000);
const RPC_READ_CONCURRENCY = 8;

interface CoreMaintenanceBatch {
  campaignIds: bigint[];
  passIds: bigint[];
}

async function mapWithConcurrency<T, R>(
  values: T[],
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(RPC_READ_CONCURRENCY, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(values[index]!);
      }
    }),
  );
  return results;
}

export function createCoreMaintenanceBatches(
  campaignCount: bigint,
  passCount: bigint,
): CoreMaintenanceBatch[] {
  if (campaignCount < BigInt(0) || passCount < BigInt(0)) {
    throw new Error("Contract entry counts cannot be negative.");
  }
  const batches: CoreMaintenanceBatch[] = [];
  let campaignId = BigInt(1);
  let passId = BigInt(1);
  while (campaignId <= campaignCount || passId <= passCount) {
    const campaignIds: bigint[] = [];
    const passIds: bigint[] = [];
    while (campaignId <= campaignCount && campaignIds.length < CONTRACT_MAINTENANCE_PAGE_SIZE) {
      campaignIds.push(campaignId);
      campaignId += BigInt(1);
    }
    while (
      passId <= passCount
      && campaignIds.length + passIds.length < CONTRACT_MAINTENANCE_PAGE_SIZE
    ) {
      passIds.push(passId);
      passId += BigInt(1);
    }
    batches.push({ campaignIds, passIds });
  }
  return batches;
}

export function isMissingMaintenanceFunctionError(error: unknown): boolean {
  return error instanceof Error
    && /non-existent contract function[\s\S]*maintain_storage/i.test(error.message);
}

function createMetadataMaintenanceBatches(
  merchants: string[],
  campaignIds: bigint[],
): Array<{ merchants: string[]; campaignIds: bigint[] }> {
  const batches: Array<{ merchants: string[]; campaignIds: bigint[] }> = [];
  let merchantCursor = 0;
  let campaignCursor = 0;
  while (merchantCursor < merchants.length || campaignCursor < campaignIds.length) {
    const merchantBatch = merchants.slice(
      merchantCursor,
      merchantCursor + CONTRACT_MAINTENANCE_PAGE_SIZE,
    );
    merchantCursor += merchantBatch.length;
    const remaining = CONTRACT_MAINTENANCE_PAGE_SIZE - merchantBatch.length;
    const campaignBatch = campaignIds.slice(campaignCursor, campaignCursor + remaining);
    campaignCursor += campaignBatch.length;
    batches.push({ merchants: merchantBatch, campaignIds: campaignBatch });
  }
  return batches;
}

function unwrapVoidResult(result: {
  isErr(): boolean;
  unwrap(): void;
  unwrapErr(): { message: string };
}): void {
  if (result.isErr()) {
    throw new Error(`Storage maintenance failed: ${result.unwrapErr().message}`);
  }
  result.unwrap();
}

class StellarContractMaintenanceWriter {
  private readonly sponsor: Keypair;

  constructor(
    private readonly config: StellarConfig,
    sponsorSecret: string,
  ) {
    this.sponsor = Keypair.fromSecret(sponsorSecret);
  }

  private clientOptions(contractId: string) {
    return {
      contractId,
      networkPassphrase: this.config.networkPassphrase,
      rpcUrl: this.config.rpcUrl,
      publicKey: this.sponsor.publicKey(),
      ...basicNodeSigner(this.sponsor, this.config.networkPassphrase),
    };
  }

  async maintainCore(campaignCount: bigint, passCount: bigint): Promise<string[]> {
    const hashes: string[] = [];
    const client = new WrenPassClient(this.clientOptions(this.config.wrenPassContractId));
    for (const batch of createCoreMaintenanceBatches(campaignCount, passCount)) {
      const transaction = await client.maintain_storage({
        campaign_ids: batch.campaignIds,
        pass_ids: batch.passIds,
      });
      if (!transaction.built || BigInt(transaction.built.fee) > MAX_MAINTENANCE_FEE_STROOPS) {
        throw new Error("Core storage maintenance exceeded its fee safety limit.");
      }
      const sent = await transaction.signAndSend();
      unwrapVoidResult(sent.result);
      if (sent.sendTransactionResponse?.hash) hashes.push(sent.sendTransactionResponse.hash);
    }
    return hashes;
  }

  async maintainMetadata(merchants: string[], campaignIds: bigint[]): Promise<string[]> {
    const hashes: string[] = [];
    const client = new MetadataClient(this.clientOptions(this.config.metadataContractId));
    for (const batch of createMetadataMaintenanceBatches(merchants, campaignIds)) {
      const transaction = await client.maintain_storage({
        merchants: batch.merchants,
        campaign_ids: batch.campaignIds,
      });
      if (!transaction.built || BigInt(transaction.built.fee) > MAX_MAINTENANCE_FEE_STROOPS) {
        throw new Error("Metadata storage maintenance exceeded its fee safety limit.");
      }
      const sent = await transaction.signAndSend();
      unwrapVoidResult(sent.result);
      if (sent.sendTransactionResponse?.hash) hashes.push(sent.sendTransactionResponse.hash);
    }
    return hashes;
  }
}

export interface TtlMaintenanceResult {
  entriesInspected: number;
  minimumRemainingLedgers: number;
  entriesExtended: number;
  transactionsSubmitted: number;
}

export class TtlMaintenanceService {
  constructor(
    private readonly config: StellarConfig,
    private readonly sponsorSecret: string,
  ) {}

  async maintain(): Promise<TtlMaintenanceResult> {
    const repositories = createOffchainRepositories();
    const metadataReader = new StellarMetadataContractReader(this.config);
    const profileIndex = new MerchantProfileEventIndex(
      this.config,
      repositories.indexedBlockchainEvents,
    );
    const [campaignCount, passCount, reviewCount, indexedMerchants] = await Promise.all([
      readContractCampaignCount(this.config),
      readContractPassCount(this.config),
      readContractReviewCount(this.config),
      profileIndex.listMerchantWallets(),
    ]);

    const metadataCampaignIds: bigint[] = [];
    const merchantSet = new Set(indexedMerchants);
    const allCampaignIds = Array.from(
      { length: Number(campaignCount) },
      (_, index) => BigInt(index + 1),
    );
    const campaignRecords = await mapWithConcurrency(allCampaignIds, async (campaignId) => {
      const [campaign, metadata] = await Promise.all([
        readContractCampaign(this.config, campaignId),
        metadataReader.getCampaignMetadata(campaignId),
      ]);
      return { campaignId, campaign, metadata };
    });
    for (const { campaignId, campaign, metadata } of campaignRecords) {
      if (campaign) merchantSet.add(campaign.merchant);
      if (metadata) {
        metadataCampaignIds.push(campaignId);
        merchantSet.add(metadata.merchant);
      }
    }
    const merchantCandidates = [...merchantSet];
    const profiles = await mapWithConcurrency(
      merchantCandidates,
      (merchant) => metadataReader.getMerchantProfile(merchant),
    );
    const merchants = merchantCandidates.filter((_, index) => profiles[index] !== null);
    const merchantIndexes: MetadataMerchantIndex[] = await mapWithConcurrency(
      merchants,
      async (merchant) => ({
        merchant,
        campaignCount: await metadataReader.getMerchantCampaignCount(merchant),
      }),
    );

    const primaryGroups = [
      {
        label: "WrenPass contract",
        keys: createWrenPassLedgerKeys(this.config.wrenPassContractId, campaignCount, passCount),
      },
      {
        label: "WrenPass metadata contract",
        keys: createMetadataLedgerKeys(
          this.config.metadataContractId,
          merchantIndexes,
          metadataCampaignIds,
        ),
      },
      {
        label: "WrenPass review contract",
        keys: createReviewLedgerKeys(this.config.reviewContractId, reviewCount),
      },
      {
        label: "WrenPass redemption registry",
        keys: createRedemptionRegistryLedgerKeys(this.config.redemptionContractId),
      },
      ...(this.config.publisherContractId
        ? [{
            label: "WrenPass campaign publisher",
            keys: createCampaignPublisherLedgerKeys(this.config.publisherContractId),
          }]
        : []),
    ];
    const codeKeys = await Promise.all(
      [
        this.config.wrenPassContractId,
        this.config.metadataContractId,
        this.config.reviewContractId,
        this.config.redemptionContractId,
        ...(this.config.publisherContractId ? [this.config.publisherContractId] : []),
      ].map((contractId) => readContractCodeLedgerKey(this.config.rpcUrl, contractId)),
    );
    let inspections = await Promise.all([
      ...primaryGroups.map((group) =>
        inspectLedgerKeysTtl(this.config.rpcUrl, group.keys, group.label)),
      inspectLedgerKeysTtl(this.config.rpcUrl, codeKeys, "WrenPass contract code"),
    ]);

    const writer = new StellarContractMaintenanceWriter(this.config, this.sponsorSecret);
    const transactionHashes: string[] = [];
    let entriesExtended = 0;
    if (inspections[0]!.keysBelowThreshold.length > 0) {
      if (campaignCount + passCount > BigInt(0)) {
        try {
          transactionHashes.push(...await writer.maintainCore(campaignCount, passCount));
        } catch (error) {
          if (!isMissingMaintenanceFunctionError(error)) throw error;
          transactionHashes.push(...await extendLedgerKeysTtl({
            config: this.config,
            sponsorSecret: this.sponsorSecret,
            keys: inspections[0]!.keysBelowThreshold,
          }));
        }
      } else {
        transactionHashes.push(...await extendLedgerKeysTtl({
          config: this.config,
          sponsorSecret: this.sponsorSecret,
          keys: inspections[0]!.keysBelowThreshold,
        }));
      }
      entriesExtended += inspections[0]!.keysBelowThreshold.length;
    }
    if (inspections[1]!.keysBelowThreshold.length > 0) {
      if (merchants.length + metadataCampaignIds.length > 0) {
        try {
          transactionHashes.push(
            ...await writer.maintainMetadata(merchants, metadataCampaignIds),
          );
        } catch (error) {
          if (!isMissingMaintenanceFunctionError(error)) throw error;
          transactionHashes.push(...await extendLedgerKeysTtl({
            config: this.config,
            sponsorSecret: this.sponsorSecret,
            keys: inspections[1]!.keysBelowThreshold,
          }));
        }
      } else {
        transactionHashes.push(...await extendLedgerKeysTtl({
          config: this.config,
          sponsorSecret: this.sponsorSecret,
          keys: inspections[1]!.keysBelowThreshold,
        }));
      }
      entriesExtended += inspections[1]!.keysBelowThreshold.length;
    }
    for (const inspection of inspections.slice(2)) {
      transactionHashes.push(...await extendLedgerKeysTtl({
        config: this.config,
        sponsorSecret: this.sponsorSecret,
        keys: inspection.keysBelowThreshold,
      }));
      entriesExtended += inspection.keysBelowThreshold.length;
    }

    if (entriesExtended > 0) {
      inspections = await Promise.all([
        ...primaryGroups.map((group) =>
          inspectLedgerKeysTtl(this.config.rpcUrl, group.keys, group.label)),
        inspectLedgerKeysTtl(this.config.rpcUrl, codeKeys, "WrenPass contract code"),
      ]);
      if (inspections.some((inspection) => inspection.keysBelowThreshold.length > 0)) {
        throw new Error("Stellar confirmed TTL maintenance but one or more entries remain below the safety threshold.");
      }
    }

    const entriesInspected = inspections.reduce((sum, item) => sum + item.entryCount, 0);
    return {
      entriesInspected,
      minimumRemainingLedgers: Math.min(
        ...inspections.map((item) => item.minimumRemainingLedgers),
      ),
      entriesExtended,
      transactionsSubmitted: transactionHashes.length,
    };
  }
}
