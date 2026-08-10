// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  fromIndexedReviewEvent,
  reviewEventIndexId,
  toIndexedReviewEvent,
} from "@/server/reviews/review-event-index";
import { testCustomerAddress, testStellarConfig } from "@/test/fixtures/customer";

const reference = {
  id: "7",
  contractId: testStellarConfig.reviewContractId,
  reviewerWalletAddress: testCustomerAddress,
  transactionHash: "a".repeat(64),
  ledger: 321,
  createdAt: "2026-08-10T00:00:00.000Z",
  sourceEventId: "0000000000000000001-0000000002",
  eventIndex: 2,
};

describe("review event index", () => {
  it("stores and restores a review transaction reference in the shared event shape", () => {
    const event = toIndexedReviewEvent(reference);

    expect(event).toMatchObject({
      id: reviewEventIndexId(testStellarConfig.reviewContractId, "7"),
      eventType: "review_submitted",
      eventIndex: 2,
      payload: {
        reviewId: "7",
        reviewerWalletAddress: testCustomerAddress,
        sourceEventId: reference.sourceEventId,
      },
    });
    expect(
      fromIndexedReviewEvent(
        event,
        testStellarConfig.reviewContractId,
        "7",
      ),
    ).toEqual(reference);
  });

  it("does not accept a cached event for a different review", () => {
    expect(
      fromIndexedReviewEvent(
        toIndexedReviewEvent(reference),
        testStellarConfig.reviewContractId,
        "8",
      ),
    ).toBeNull();
  });
});
