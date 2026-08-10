// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentStore } from "@/server/firestore/document-store";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import { reviewEventIndexId, toIndexedReviewEvent } from "@/server/reviews/review-event-index";
import { ReviewReader } from "@/server/reviews/review-reader";
import { testStellarConfig, testCustomerAddress } from "@/test/fixtures/customer";

const mocks = vi.hoisted(() => ({
  readContractReviews: vi.fn(),
}));

vi.mock("@/lib/stellar/reviews-client", () => ({
  readContractReviews: mocks.readContractReviews,
}));

function createStore(): DocumentStore {
  const documents = new Map<string, Record<string, unknown>>();
  const key = (collection: string, id: string) => `${collection}/${id}`;
  return {
    read: vi.fn(async (collection, id) => documents.get(key(collection, id)) ?? null),
    findMany: vi.fn(async () => []),
    write: vi.fn(async (collection, id, data) => {
      documents.set(key(collection, id), data);
    }),
    remove: vi.fn(async (collection, id) => {
      documents.delete(key(collection, id));
    }),
  };
}

describe("ReviewReader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enriches reviews with indexed and recovered Stellar transaction hashes", async () => {
    mocks.readContractReviews.mockResolvedValue({
      reviews: [
        {
          id: BigInt(2),
          reviewer: testCustomerAddress,
          rating: 5,
          message: "Simple and useful.",
          created_at: BigInt(1_700_000_000),
        },
        {
          id: BigInt(1),
          reviewer: testCustomerAddress,
          rating: 4,
          message: "Worked as expected.",
          created_at: BigInt(1_699_999_000),
        },
      ],
      nextCursor: BigInt(1),
      hasMore: false,
    });
    const repositories = createOffchainRepositories(createStore());
    await repositories.indexedBlockchainEvents.save(toIndexedReviewEvent({
      id: "2",
      contractId: testStellarConfig.reviewContractId,
      reviewerWalletAddress: testCustomerAddress,
      transactionHash: "a".repeat(64),
      ledger: 200,
      createdAt: "2026-08-10T00:00:00.000Z",
    }));
    const eventSource = {
      readRetainedReferences: vi.fn(async () => [
        {
          id: "1",
          contractId: testStellarConfig.reviewContractId,
          reviewerWalletAddress: testCustomerAddress,
          transactionHash: "b".repeat(64),
          ledger: 199,
          createdAt: "2026-08-09T23:59:00.000Z",
        },
      ]),
    };
    const reader = new ReviewReader(
      testStellarConfig,
      repositories.indexedBlockchainEvents,
      eventSource,
    );

    const result = await reader.readPage({ limit: 12 });

    expect(result.reviews.map((review) => review.transactionHash)).toEqual([
      "a".repeat(64),
      "b".repeat(64),
    ]);
    expect(result.reviews.every((review) => review.network === "testnet")).toBe(true);
    await expect(
      repositories.indexedBlockchainEvents.findById(
        reviewEventIndexId(testStellarConfig.reviewContractId, "1"),
      ),
    ).resolves.toMatchObject({
      transactionHash: "b".repeat(64),
      eventType: "review_submitted",
    });
  });
});
