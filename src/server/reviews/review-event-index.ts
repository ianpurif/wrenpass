import "server-only";

import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

import {
  entityIdSchema,
  indexedBlockchainEventSchema,
  sha256Schema,
  type IndexedBlockchainEvent,
} from "@/server/models";

export const REVIEW_SUBMITTED_EVENT_TYPE = "review_submitted";

const reviewIdSchema = z.string().regex(/^[1-9]\d*$/);

export const reviewTransactionReferenceSchema = z.object({
  id: reviewIdSchema,
  contractId: entityIdSchema,
  reviewerWalletAddress: z
    .string()
    .refine(StrKey.isValidEd25519PublicKey, "must be a valid Stellar account"),
  transactionHash: sha256Schema,
  ledger: z.number().int().positive(),
  createdAt: z.string().datetime(),
  sourceEventId: entityIdSchema.optional(),
  eventIndex: z.number().int().nonnegative().optional(),
});

export type ReviewTransactionReference = z.infer<
  typeof reviewTransactionReferenceSchema
>;

export function reviewEventIndexId(contractId: string, reviewId: string): string {
  return entityIdSchema.parse(
    `review-${entityIdSchema.parse(contractId)}-${reviewIdSchema.parse(reviewId)}`,
  );
}

export function toIndexedReviewEvent(
  reference: ReviewTransactionReference,
): IndexedBlockchainEvent {
  const validated = reviewTransactionReferenceSchema.parse(reference);
  return indexedBlockchainEventSchema.parse({
    id: reviewEventIndexId(validated.contractId, validated.id),
    contractId: validated.contractId,
    transactionHash: validated.transactionHash,
    eventIndex: validated.eventIndex ?? 0,
    ledger: validated.ledger,
    eventType: REVIEW_SUBMITTED_EVENT_TYPE,
    payload: {
      reviewId: validated.id,
      reviewerWalletAddress: validated.reviewerWalletAddress,
      ...(validated.sourceEventId
        ? { sourceEventId: validated.sourceEventId }
        : {}),
    },
    indexedAt: validated.createdAt,
  });
}

export function fromIndexedReviewEvent(
  event: IndexedBlockchainEvent,
  expectedContractId: string,
  expectedReviewId: string,
): ReviewTransactionReference | null {
  if (
    event.id !== reviewEventIndexId(expectedContractId, expectedReviewId) ||
    event.contractId !== expectedContractId ||
    event.eventType !== REVIEW_SUBMITTED_EVENT_TYPE ||
    event.payload.reviewId !== expectedReviewId ||
    typeof event.payload.reviewerWalletAddress !== "string"
  ) {
    return null;
  }

  const parsed = reviewTransactionReferenceSchema.safeParse({
    id: expectedReviewId,
    contractId: event.contractId,
    reviewerWalletAddress: event.payload.reviewerWalletAddress,
    transactionHash: event.transactionHash,
    ledger: event.ledger,
    createdAt: event.indexedAt,
    ...(typeof event.payload.sourceEventId === "string"
      ? { sourceEventId: event.payload.sourceEventId }
      : {}),
    eventIndex: event.eventIndex,
  });
  return parsed.success ? parsed.data : null;
}
