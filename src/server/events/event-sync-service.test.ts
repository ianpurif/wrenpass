import type { Campaign } from "@/generated/wrenpass-contract/src";
import { EventSyncService } from "@/server/events/event-sync-service";
import type { WrenPassEvent } from "@/server/events/event-source";
import type { DocumentStore } from "@/server/firestore/document-store";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import { userProfileSchema } from "@/server/models";
import {
  testRecipientAddress as owner,
  testStellarConfig,
} from "@/test/fixtures/customer";
import { describe, expect, it, vi } from "vitest";

function createStore(): DocumentStore {
  const documents = new Map<string, unknown>();
  const key = (collection: string, id: string) => `${collection}/${id}`;
  return {
    read: vi.fn(async (collection, id) => documents.get(key(collection, id)) ?? null),
    findMany: vi.fn(async (collection, field, value) =>
      [...documents.entries()]
        .filter(
          ([documentKey, document]) =>
            documentKey.startsWith(`${collection}/`) &&
            (document as Record<string, unknown>)[field] === value,
        )
        .map(([, document]) => document),
    ),
    write: vi.fn(async (collection, id, data) => {
      documents.set(key(collection, id), data);
    }),
    remove: vi.fn(async (collection, id) => {
      documents.delete(key(collection, id));
    }),
  };
}

const redeemedEvent: WrenPassEvent = {
  id: "000001-000002-000003",
  transactionHash: "a".repeat(64),
  eventIndex: 3,
  ledger: 1_234_567,
  eventType: "pass_redeemed",
  campaignId: "1",
  passId: "1",
  owner,
  merchant: "GADRDDWDRMVMA3UBOSZAA5NYPO6RPH6NRYMA5SCGDE33E7NC46P7KGDO",
  payload: { reserve_released: "10000000" },
};

describe("EventSyncService", () => {
  it("indexes duplicate events once and retries a failed notification", async () => {
    const repositories = createOffchainRepositories(createStore());
    await repositories.userProfiles.save(
      userProfileSchema.parse({
        id: owner,
        walletAddress: owner,
        email: "owner@example.com",
        createdAt: "2026-08-09T10:00:00.000Z",
        updatedAt: "2026-08-09T10:00:00.000Z",
      }),
    );
    const source = { readRetainedEvents: vi.fn().mockResolvedValue([redeemedEvent]) };
    const email = { send: vi.fn().mockRejectedValueOnce(new Error("smtp unavailable")).mockResolvedValue("message-1") };
    const campaigns = { findCampaign: vi.fn<() => Promise<Campaign | null>>().mockResolvedValue(null) };
    const service = new EventSyncService(
      source,
      repositories,
      campaigns,
      email,
      testStellarConfig.wrenPassContractId,
      () => new Date("2026-08-09T10:01:00.000Z"),
    );

    await expect(service.sync()).resolves.toMatchObject({
      indexed: 1,
      duplicates: 0,
      notificationsSent: 0,
      notificationFailures: 1,
    });
    await expect(service.sync()).resolves.toMatchObject({
      indexed: 0,
      duplicates: 1,
      notificationsSent: 1,
      notificationFailures: 0,
    });
    await expect(service.sync()).resolves.toMatchObject({
      indexed: 0,
      duplicates: 1,
      notificationsSent: 0,
      notificationFailures: 0,
    });

    expect(email.send).toHaveBeenCalledTimes(2);
    await expect(repositories.indexedBlockchainEvents.findById(redeemedEvent.id)).resolves.toMatchObject({
      eventType: "pass_redeemed",
      payload: { campaignId: "1", passId: "1", reserve_released: "10000000" },
    });
    await expect(
      repositories.notifications.findById(`${redeemedEvent.id}:pass_redeemed:${owner}`),
    ).resolves.toMatchObject({ status: "sent", recipientEmail: "owner@example.com" });
  });
});
