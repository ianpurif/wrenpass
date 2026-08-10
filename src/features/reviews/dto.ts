import type { Review } from "@/generated/reviews-contract/src";
import type { StellarNetwork } from "@/lib/stellar/config";

export interface ReviewDto {
  id: string;
  reviewer: string;
  rating: number;
  message: string;
  createdAt: string;
  transactionHash: string | null;
  network: StellarNetwork;
}

export interface ReviewPageDto {
  reviews: ReviewDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function toReviewDto(
  review: Review,
  transactionHash: string | null,
  network: StellarNetwork,
): ReviewDto {
  const timestamp = Number(review.created_at);
  if (!Number.isSafeInteger(timestamp)) {
    throw new Error("Review timestamp is outside the supported range.");
  }

  return {
    id: review.id.toString(),
    reviewer: review.reviewer,
    rating: review.rating,
    message: review.message,
    createdAt: new Date(timestamp * 1_000).toISOString(),
    transactionHash,
    network,
  };
}
