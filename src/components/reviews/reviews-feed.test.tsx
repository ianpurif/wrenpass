import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewsFeed } from "@/components/reviews/reviews-feed";
import type { ReviewDto } from "@/features/reviews/dto";
import { testCustomerAddress, testRecipientAddress } from "@/test/fixtures/customer";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("@/features/reviews/api", () => ({
  reviewsApi: { list: mocks.list },
}));

const newestReview: ReviewDto = {
  id: "2",
  reviewer: testCustomerAddress,
  rating: 5,
  message: "The purchase flow was clear from start to finish.",
  createdAt: "2026-08-10T04:00:00.000Z",
  transactionHash: "a".repeat(64),
  network: "testnet",
};

const olderReview: ReviewDto = {
  id: "1",
  reviewer: testRecipientAddress,
  rating: 4,
  message: "Gifting the pass felt safe and deliberate.",
  createdAt: "2026-08-09T04:00:00.000Z",
  transactionHash: "b".repeat(64),
  network: "testnet",
};

describe("ReviewsFeed", () => {
  let intersectionCallback: IntersectionObserverCallback;

  beforeEach(() => {
    mocks.list.mockReset().mockResolvedValue({
      reviews: [olderReview],
      nextCursor: "1",
      hasMore: false,
    });
    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }
      disconnect = vi.fn();
      observe = vi.fn();
      takeRecords = vi.fn(() => []);
      unobserve = vi.fn();
      root = null;
      rootMargin = "400px 0px";
      thresholds = [0];
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  it("loads the next on-chain page when the scroll sentinel becomes visible", async () => {
    render(
      <ReviewsFeed
        initialPage={{ reviews: [newestReview], nextCursor: "2", hasMore: true }}
      />,
    );

    expect(screen.getByText(newestReview.message, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(testCustomerAddress)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View on-chain/i })).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${"a".repeat(64)}`,
    );
    expect(screen.getByRole("link", { name: /View on-chain/i })).toHaveAttribute(
      "target",
      "_blank",
    );

    await act(async () => {
      intersectionCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    await waitFor(() => expect(mocks.list).toHaveBeenCalledWith({ beforeId: "2", limit: 12 }));
    expect(await screen.findByText(olderReview.message, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(testRecipientAddress)).toBeInTheDocument();
    expect(screen.getByText(/beginning of the review ledger/i)).toBeInTheDocument();
  });
});
