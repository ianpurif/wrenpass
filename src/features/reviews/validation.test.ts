import { describe, expect, it } from "vitest";

import {
  REVIEW_MESSAGE_MAX_BYTES,
  reviewInputSchema,
} from "@/features/reviews/validation";

describe("reviewInputSchema", () => {
  it("accepts a trimmed 1 to 5 star review", () => {
    expect(reviewInputSchema.parse({ rating: 5, message: "  Excellent experience.  " })).toEqual({
      rating: 5,
      message: "Excellent experience.",
    });
  });

  it("rejects missing ratings and empty messages", () => {
    expect(reviewInputSchema.safeParse({ rating: 0, message: "Great" }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ rating: 6, message: "Great" }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ rating: 5, message: "  " }).success).toBe(false);
  });

  it("enforces the on-chain UTF-8 byte limit", () => {
    const message = "\u{1F989}".repeat(Math.floor(REVIEW_MESSAGE_MAX_BYTES / 4) + 1);

    expect(message.length).toBeLessThanOrEqual(280);
    expect(reviewInputSchema.safeParse({ rating: 5, message }).success).toBe(false);
  });
});
