// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type { DocumentStore } from "@/server/firestore/document-store";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import {
  fromIndexedMerchantProfileEvent,
  merchantProfileEventIndexId,
  MerchantProfileEventIndex,
  toIndexedMerchantProfileEvent,
} from "@/server/merchant/profile-event-index";
import { testCustomerAddress, testStellarConfig } from "@/test/fixtures/customer";

function createStore(): DocumentStore {
  const documents = new Map<string, Record<string, unknown>>();
  const key = (collection: string, id: string) => `${collection}/${id}`;
  return {
    read: async (collection, id) => documents.get(key(collection, id)) ?? null,
    findMany: async (collection, field, value) =>
      [...documents.entries()]
        .filter(([documentKey, document]) =>
          documentKey.startsWith(`${collection}/`) && document[field] === value)
        .map(([, document]) => document),
    write: async (collection, id, data) => {
      documents.set(key(collection, id), data);
    },
    remove: async (collection, id) => {
      documents.delete(key(collection, id));
    },
  };
}

const first = {
  contractId: testStellarConfig.metadataContractId,
  merchantWalletAddress: testCustomerAddress,
  transactionHash: "a".repeat(64),
  ledger: 100,
  eventIndex: 1,
  occurredAt: "2026-08-10T00:00:00.000Z",
  sourceEventId: "0000000000000000001-0000000001",
};
const latest = {
  ...first,
  transactionHash: "b".repeat(64),
  ledger: 101,
  eventIndex: 2,
  occurredAt: "2026-08-10T00:00:05.000Z",
  sourceEventId: "0000000000000000002-0000000002",
};

describe("MerchantProfileEventIndex", () => {
  it("round-trips a verified metadata profile event", () => {
    const event = toIndexedMerchantProfileEvent(latest);

    expect(event.id).toBe(
      merchantProfileEventIndexId(
        testStellarConfig.metadataContractId,
        testCustomerAddress,
      ),
    );
    expect(
      fromIndexedMerchantProfileEvent(
        event,
        testStellarConfig.metadataContractId,
      ),
    ).toEqual(latest);
  });

  it("indexes only the latest retained event and lists its merchant", async () => {
    const events = createOffchainRepositories(createStore()).indexedBlockchainEvents;
    const source = { readRetainedReferences: vi.fn(async () => [latest, first]) };
    const index = new MerchantProfileEventIndex(
      testStellarConfig,
      events,
      source,
    );

    await index.indexLatest(testCustomerAddress);

    await expect(index.listMerchantWallets()).resolves.toEqual([testCustomerAddress]);
    await expect(
      events.findById(
        merchantProfileEventIndexId(
          testStellarConfig.metadataContractId,
          testCustomerAddress,
        ),
      ),
    ).resolves.toMatchObject({ transactionHash: latest.transactionHash, ledger: 101 });
  });
});
