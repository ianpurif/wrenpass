import "server-only";

import { toReviewDto, type ReviewPageDto } from "@/features/reviews/dto";
import type { StellarConfig } from "@/lib/stellar/config";
import { readContractReviews } from "@/lib/stellar/reviews-client";
import type { EntityRepository } from "@/server/firestore/repositories";
import type { ReviewReceipt } from "@/server/models";
import { StellarReviewEventSource } from "@/server/reviews/review-event-source";

interface ReviewReceiptSource {
  readRetainedReceipts(): Promise<ReviewReceipt[]>;
}

export class ReviewReader {
  constructor(
    private readonly config: StellarConfig,
    private readonly receipts: EntityRepository<ReviewReceipt>,
    private readonly eventSource: ReviewReceiptSource = new StellarReviewEventSource(config),
  ) {}

  async readPage(input: {
    beforeId?: bigint;
    limit: number;
  }): Promise<ReviewPageDto> {
    const page = await readContractReviews(this.config, input);
    const receiptsById = new Map<string, ReviewReceipt>();

    try {
      const stored = await Promise.all(
        page.reviews.map((review) => this.receipts.findById(review.id.toString())),
      );
      for (const receipt of stored) {
        if (receipt) receiptsById.set(receipt.id, receipt);
      }
    } catch (error) {
      console.error("Unable to read indexed review receipts", error);
    }

    const missingIds = new Set(
      page.reviews
        .map((review) => review.id.toString())
        .filter((id) => !receiptsById.has(id)),
    );
    if (missingIds.size > 0) {
      try {
        const recovered = await this.eventSource.readRetainedReceipts();
        for (const receipt of recovered) {
          if (!missingIds.has(receipt.id)) continue;
          receiptsById.set(receipt.id, receipt);
          await this.receipts.save(receipt).catch((error: unknown) => {
            console.error("Unable to cache recovered review receipt", error);
          });
        }
      } catch (error) {
        console.error("Unable to recover review receipts from Stellar events", error);
      }
    }

    return {
      reviews: page.reviews.map((review) =>
        toReviewDto(
          review,
          receiptsById.get(review.id.toString())?.transactionHash ?? null,
          this.config.network,
        ),
      ),
      nextCursor: page.nextCursor?.toString() ?? null,
      hasMore: page.hasMore,
    };
  }
}
