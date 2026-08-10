import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecentReviews } from "@/components/reviews/recent-reviews";
import type { ReviewDto } from "@/features/reviews/dto";
import { testCustomerAddress, testRecipientAddress } from "@/test/fixtures/customer";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@/features/reviews/api", () => ({ reviewsApi: { list: mocks.list } }));

const reviews: ReviewDto[] = [
  {
    id: "2",
    reviewer: testCustomerAddress,
    rating: 5,
    message: "The purchase flow was clear.",
    createdAt: "2026-08-10T04:00:00.000Z",
    transactionHash: "a".repeat(64),
    network: "testnet",
  },
  {
    id: "1",
    reviewer: testRecipientAddress,
    rating: 4,
    message: "Gifting felt deliberate.",
    createdAt: "2026-08-09T04:00:00.000Z",
    transactionHash: "b".repeat(64),
    network: "testnet",
  },
];

const manyReviews: ReviewDto[] = Array.from({ length: 12 }, (_, index) => ({
  ...reviews[index % reviews.length],
  id: String(12 - index),
  message: `Review ${index + 1} stays in the virtual window.`,
}));

describe("RecentReviews", () => {
  beforeEach(() => {
    mocks.list.mockReset();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        disconnect = vi.fn();
        observe = vi.fn();
        takeRecords = vi.fn(() => []);
        unobserve = vi.fn();
      },
    );
  });

  it("keeps a bounded virtual window and maps wheel input to horizontal movement", () => {
    render(<RecentReviews reviews={manyReviews} />);

    const carousel = screen.getByRole("region", { name: /Recent on-chain reviews/ });
    const scrollBy = vi.fn();
    Object.defineProperty(carousel, "scrollBy", { configurable: true, value: scrollBy });

    expect(screen.getAllByRole("article")).toHaveLength(7);

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    });
    carousel.dispatchEvent(wheelEvent);
    expect(scrollBy).toHaveBeenCalledWith({ behavior: "smooth", left: 162 });
    expect(wheelEvent.defaultPrevented).toBe(true);

    fireEvent.wheel(carousel, { deltaY: -120 });
    expect(scrollBy).toHaveBeenLastCalledWith({ behavior: "smooth", left: -162 });
  });

  it("loads the next review page when the virtual window advances", async () => {
    mocks.list.mockResolvedValue({
      reviews: [{ ...reviews[0], id: "3", message: "A newer page loaded smoothly." }],
      nextCursor: null,
      hasMore: false,
    });
    render(
      <RecentReviews
        initialPage={{ reviews, nextCursor: "1", hasMore: true }}
      />,
    );

    const carousel = screen.getByRole("region", { name: /Recent on-chain reviews/ });
    Object.defineProperty(carousel, "scrollLeft", { configurable: true, writable: true, value: 1_800 });
    fireEvent.scroll(carousel);

    expect(mocks.list).toHaveBeenCalledWith({ beforeId: "1", limit: 12 });
    expect((await screen.findAllByText("A newer page loaded smoothly.", { exact: false })).length).toBeGreaterThan(0);
  });
});
