import { z } from "zod";

import type { ReviewPageDto } from "@/features/reviews/dto";
import type { ReviewInput } from "@/features/reviews/validation";

const reviewSchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/),
  reviewer: z.string().regex(/^[GC][A-Z2-7]{55}$/),
  rating: z.number().int().min(1).max(5),
  message: z.string().min(1),
  createdAt: z.iso.datetime(),
  transactionHash: z.string().regex(/^[a-f\d]{64}$/i).nullable(),
  network: z.enum(["testnet", "mainnet"]),
});

const reviewPageSchema = z.object({
  reviews: z.array(reviewSchema),
  nextCursor: z.string().regex(/^[1-9]\d*$/).nullable(),
  hasMore: z.boolean(),
});

const sponsoredReviewPreparationSchema = z.object({
  authorizationEntry: z.string().min(1),
  expiresAtLedger: z.number().int().positive(),
});

const sponsoredReviewReceiptSchema = z.object({
  reviewId: z.string().regex(/^[1-9]\d*$/),
  transactionHash: z.string().regex(/^[a-f\d]{64}$/i),
  ledger: z.number().int().positive(),
});

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = z.object({ error: z.string() }).safeParse(body);
    throw new Error(
      message.success ? message.data.error : "Sponsored reviews are temporarily unavailable.",
    );
  }
  return body;
}

export const reviewsApi = {
  async list(input: { beforeId?: string; limit?: number; signal?: AbortSignal } = {}): Promise<ReviewPageDto> {
    const query = new URLSearchParams();
    if (input.beforeId) query.set("before", input.beforeId);
    if (input.limit) query.set("limit", String(input.limit));

    const response = await fetch(`/api/reviews?${query.toString()}`, {
      cache: "no-store",
      signal: input.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = z.object({ error: z.string() }).safeParse(body);
      throw new Error(message.success ? message.data.error : "Reviews are temporarily unavailable.");
    }
    return reviewPageSchema.parse(body);
  },

  async prepareSponsoredReview(input: ReviewInput) {
    return sponsoredReviewPreparationSchema.parse(
      await requestJson("/api/reviews/sponsor", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  },

  async submitSponsoredReview(
    input: ReviewInput & { signedAuthorizationEntry: string },
  ) {
    return sponsoredReviewReceiptSchema.parse(
      await requestJson("/api/reviews/sponsor", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    );
  },
};
