import type { Campaign, Pass } from "@/generated/wrenpass-contract/src";
import {
  EventSyncService,
  type NotificationClaimStore,
} from "@/server/events/event-sync-service";
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

function createClaimStore(
  repositories: ReturnType<typeof createOffchainRepositories>,
): NotificationClaimStore {
  const activeClaims = new Set<string>();
  return {
    async claim(notification, now, claimExpiresAt) {
      if (activeClaims.has(notification.id)) return false;
      activeClaims.add(notification.id);
      const existing = await repositories.notifications.findById(notification.id);
      if (existing?.status === "sent") {
        activeClaims.delete(notification.id);
        return false;
      }
      if (existing?.claimExpiresAt && new Date(existing.claimExpiresAt) > now) {
        activeClaims.delete(notification.id);
        return false;
      }
      await repositories.notifications.save({
        ...notification,
        createdAt: existing?.createdAt ?? notification.createdAt,
        claimExpiresAt: claimExpiresAt.toISOString(),
      });
      activeClaims.delete(notification.id);
      return true;
    },
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
        email: "owner@example.com",
        createdAt: "2026-08-09T10:00:00.000Z",
        updatedAt: "2026-08-09T10:00:00.000Z",
      }),
    );
    const source = { readRetainedEvents: vi.fn().mockResolvedValue([redeemedEvent]) };
    const email = { send: vi.fn().mockRejectedValueOnce(new Error("smtp unavailable")).mockResolvedValue("message-1") };
    const campaigns = {
      findCampaign: vi.fn<() => Promise<Campaign | null>>().mockResolvedValue(null),
      getPassCount: vi.fn().mockResolvedValue(BigInt(0)),
      findPass: vi.fn().mockResolvedValue(null),
    };
    const service = new EventSyncService(
      source,
      repositories,
      campaigns,
      createClaimStore(repositories),
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
    ).resolves.toMatchObject({
      status: "sent",
      recipientWalletAddress: owner,
    });
  });

  it("sends one deterministic notice for an active pass expiring within seven days", async () => {
    const repositories = createOffchainRepositories(createStore());
    await repositories.userProfiles.save(
      userProfileSchema.parse({
        id: owner,
        email: "owner@example.com",
        createdAt: "2026-08-09T10:00:00.000Z",
        updatedAt: "2026-08-09T10:00:00.000Z",
      }),
    );
    const expiresAt = BigInt(Math.floor(new Date("2026-08-14T10:00:00.000Z").getTime() / 1_000));
    const pass: Pass = {
      id: BigInt(1),
      campaign_id: BigInt(1),
      owner,
      status: { tag: "Active", values: undefined },
      purchased_at: BigInt(1_786_261_200),
      purchase_amounts: {
        total: BigInt(50_000_000),
        merchant_release: BigInt(37_500_000),
        protected_reserve: BigInt(10_000_000),
        platform_fee: BigInt(2_500_000),
      },
    };
    const campaign = {
      cancellation_funds: BigInt(0),
      cancellation_shortfall: BigInt(0),
      created_at: BigInt(1_786_261_100),
      expires_at: expiresAt,
      financial_rules: { merchant_bps: 7_500, reserve_bps: 2_000, platform_fee_bps: 500 },
      id: BigInt(1),
      max_supply: 100,
      merchant: redeemedEvent.merchant!,
      merchant_released: BigInt(37_500_000),
      pass_price: BigInt(50_000_000),
      payment_asset: testStellarConfig.assetContractId,
      platform: owner,
      platform_fees_paid: BigInt(2_500_000),
      protected_funds: BigInt(10_000_000),
      redeemed: 0,
      refunded: 0,
      service_value: BigInt(60_000_000),
      sold: 1,
      status: { tag: "Active" as const, values: undefined },
    } satisfies Campaign;
    const lifecycle = {
      findCampaign: vi.fn().mockResolvedValue(campaign),
      getPassCount: vi.fn().mockResolvedValue(BigInt(1)),
      findPass: vi.fn().mockResolvedValue(pass),
    };
    const email = { send: vi.fn().mockResolvedValue("message-1") };
    const service = new EventSyncService(
      { readRetainedEvents: vi.fn().mockResolvedValue([]) },
      repositories,
      lifecycle,
      createClaimStore(repositories),
      email,
      testStellarConfig.wrenPassContractId,
      () => new Date("2026-08-09T10:00:00.000Z"),
    );

    await expect(service.sync()).resolves.toMatchObject({ notificationsSent: 1 });
    await expect(service.sync()).resolves.toMatchObject({ notificationsSent: 0 });
    expect(email.send).toHaveBeenCalledTimes(1);
    await expect(
      repositories.notifications.findById(`expiring-1-${expiresAt}:pass_nearing_expiration:${owner}`),
    ).resolves.toMatchObject({ status: "sent", type: "pass_nearing_expiration" });
  });

  it("claims a notification once when sync requests overlap", async () => {
    const repositories = createOffchainRepositories(createStore());
    await repositories.userProfiles.save(
      userProfileSchema.parse({
        id: owner,
        email: "owner@example.com",
        createdAt: "2026-08-09T10:00:00.000Z",
        updatedAt: "2026-08-09T10:00:00.000Z",
      }),
    );
    const source = { readRetainedEvents: vi.fn().mockResolvedValue([redeemedEvent]) };
    const lifecycle = {
      findCampaign: vi.fn().mockResolvedValue(null),
      getPassCount: vi.fn().mockResolvedValue(BigInt(0)),
      findPass: vi.fn().mockResolvedValue(null),
    };
    const claims = createClaimStore(repositories);
    const email = { send: vi.fn().mockResolvedValue("message-1") };
    const service = new EventSyncService(
      source,
      repositories,
      lifecycle,
      claims,
      email,
      testStellarConfig.wrenPassContractId,
      () => new Date("2026-08-09T10:01:00.000Z"),
    );

    await Promise.all([service.sync(), service.sync()]);

    expect(email.send).toHaveBeenCalledTimes(1);
  });
});
