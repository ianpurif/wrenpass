import "server-only";

import { toReviewDto, type ReviewPageDto } from "@/features/reviews/dto";
import type { StellarConfig } from "@/lib/stellar/config";
import { readContractReviews } from "@/lib/stellar/reviews-client";
import type { EntityRepository } from "@/server/firestore/repositories";
import type { IndexedBlockchainEvent } from "@/server/models";
import { StellarReviewEventSource } from "@/server/reviews/review-event-source";
import {
  fromIndexedReviewEvent,
  reviewEventIndexId,
  toIndexedReviewEvent,
  type ReviewTransactionReference,
} from "@/server/reviews/review-event-index";

interface ReviewEventSource {
  readRetainedReferences(): Promise<ReviewTransactionReference[]>;
}

export class ReviewReader {
  constructor(
    private readonly config: StellarConfig,
    private readonly events: EntityRepository<IndexedBlockchainEvent>,
    private readonly eventSource: ReviewEventSource = new StellarReviewEventSource(config),
  ) {}

  async readPage(input: {
    beforeId?: bigint;
    limit: number;
  }): Promise<ReviewPageDto> {
    const page = await readContractReviews(this.config, input);
    const referencesById = new Map<string, ReviewTransactionReference>();

    try {
      const stored = await Promise.all(
        page.reviews.map((review) => {
          const reviewId = review.id.toString();
          return this.events.findById(
            reviewEventIndexId(this.config.reviewContractId, reviewId),
          );
        }),
      );
      for (const [index, event] of stored.entries()) {
        if (!event) continue;
        const reviewId = page.reviews[index].id.toString();
        const reference = fromIndexedReviewEvent(
          event,
          this.config.reviewContractId,
          reviewId,
        );
        if (reference) referencesById.set(reference.id, reference);
      }
    } catch (error) {
      console.error("Unable to read indexed review events", error);
    }

    const missingIds = new Set(
      page.reviews
        .map((review) => review.id.toString())
        .filter((id) => !referencesById.has(id)),
    );
    if (missingIds.size > 0) {
      try {
        const recovered = await this.eventSource.readRetainedReferences();
        for (const reference of recovered) {
          if (!missingIds.has(reference.id)) continue;
          referencesById.set(reference.id, reference);
          await this.events.save(toIndexedReviewEvent(reference)).catch((error: unknown) => {
            console.error("Unable to cache recovered review event", error);
          });
        }
      } catch (error) {
        console.error("Unable to recover transaction links from Stellar review events", error);
      }
    }

    return {
      reviews: page.reviews.map((review) =>
        toReviewDto(
          review,
          referencesById.get(review.id.toString())?.transactionHash ?? null,
          this.config.network,
        ),
      ),
      nextCursor: page.nextCursor?.toString() ?? null,
      hasMore: page.hasMore,
    };
  }
}
