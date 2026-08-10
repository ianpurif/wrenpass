import { z } from "zod";

import { readContractReviews } from "@/lib/stellar/reviews-client";
import { getStellarConfig } from "@/lib/stellar/config";
import { closeFirebaseApp, getFirestoreDb } from "@/server/firestore/firebase-admin";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import {
  fromIndexedReviewEvent,
  reviewEventIndexId,
  reviewTransactionReferenceSchema,
  toIndexedReviewEvent,
  type ReviewTransactionReference,
} from "@/server/reviews/review-event-index";
import { StellarReviewEventSource } from "@/server/reviews/review-event-source";

const LEGACY_COLLECTION = "review_receipts";
const PAGE_SIZE = 20;

const legacyReceiptSchema = reviewTransactionReferenceSchema.omit({
  sourceEventId: true,
  eventIndex: true,
});

async function readAllContractReviewOwners(): Promise<Map<string, string>> {
  const config = getStellarConfig();
  const owners = new Map<string, string>();
  let beforeId: bigint | undefined;

  while (true) {
    const page = await readContractReviews(config, { beforeId, limit: PAGE_SIZE });
    for (const review of page.reviews) {
      owners.set(review.id.toString(), review.reviewer);
    }
    if (!page.hasMore || page.nextCursor === null) return owners;
    beforeId = page.nextCursor;
  }
}

function assertSameReceipt(
  legacy: z.infer<typeof legacyReceiptSchema>,
  stellar: ReviewTransactionReference,
): void {
  const comparableFields = [
    "id",
    "contractId",
    "reviewerWalletAddress",
    "transactionHash",
    "ledger",
  ] as const;
  for (const field of comparableFields) {
    if (legacy[field] !== stellar[field]) {
      throw new Error(`Legacy review ${legacy.id} differs from Stellar at ${field}.`);
    }
  }
}

async function run(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const config = getStellarConfig();
  const db = getFirestoreDb();
  const repositories = createOffchainRepositories();

  try {
    const [legacySnapshot, retainedEvents, contractOwners] = await Promise.all([
      db.collection(LEGACY_COLLECTION).get(),
      new StellarReviewEventSource(config).readRetainedReferences(),
      readAllContractReviewOwners(),
    ]);
    const legacyReceipts = legacySnapshot.docs.map((document) => {
      const parsed = legacyReceiptSchema.parse(document.data());
      if (document.id !== parsed.id) {
        throw new Error(`Legacy review document ${document.id} has a mismatched ID.`);
      }
      return parsed;
    });
    const retainedById = new Map(retainedEvents.map((event) => [event.id, event]));

    if (retainedById.size !== retainedEvents.length) {
      throw new Error("Stellar returned duplicate review event IDs.");
    }
    if (contractOwners.size !== retainedById.size) {
      throw new Error(
        "Not every on-chain review has a retained Stellar event; the legacy cache was not changed.",
      );
    }

    for (const [reviewId, reviewer] of contractOwners) {
      const retained = retainedById.get(reviewId);
      if (!retained || retained.reviewerWalletAddress !== reviewer) {
        throw new Error(`Review ${reviewId} does not match its retained Stellar event.`);
      }
    }
    for (const legacy of legacyReceipts) {
      const retained = retainedById.get(legacy.id);
      if (!retained) {
        throw new Error(`Legacy review ${legacy.id} has no retained Stellar event.`);
      }
      assertSameReceipt(legacy, retained);
    }

    let indexedCount = 0;
    for (const retained of retainedEvents) {
      const stored = await repositories.indexedBlockchainEvents.findById(
        reviewEventIndexId(config.reviewContractId, retained.id),
      );
      if (!stored) continue;
      const recovered = fromIndexedReviewEvent(
        stored,
        config.reviewContractId,
        retained.id,
      );
      if (!recovered) {
        throw new Error(`Review ${retained.id} has an invalid unified event record.`);
      }
      assertSameReceipt(retained, recovered);
      indexedCount += 1;
    }

    console.log(
      `Verified ${contractOwners.size} on-chain reviews, ${retainedEvents.length} retained Stellar events, ${indexedCount} unified event records, and ${legacyReceipts.length} legacy receipts.`,
    );
    if (!apply) {
      console.log("Dry run complete. Use --apply to backfill the unified event index.");
      return;
    }

    for (const retained of retainedEvents) {
      await repositories.indexedBlockchainEvents.save(toIndexedReviewEvent(retained));
    }
    for (const retained of retainedEvents) {
      const stored = await repositories.indexedBlockchainEvents.findById(
        reviewEventIndexId(config.reviewContractId, retained.id),
      );
      if (!stored) throw new Error(`Review ${retained.id} was not backfilled.`);
      const recovered = fromIndexedReviewEvent(
        stored,
        config.reviewContractId,
        retained.id,
      );
      if (!recovered) throw new Error(`Review ${retained.id} failed read-back validation.`);
      assertSameReceipt(retained, recovered);
    }

    for (const document of legacySnapshot.docs) {
      await document.ref.delete();
    }
    const remaining = await db.collection(LEGACY_COLLECTION).get();
    if (!remaining.empty) {
      throw new Error("The legacy review receipt collection was not fully removed.");
    }
    console.log(
      `Backfilled and verified ${retainedEvents.length} review events; removed ${legacyReceipts.length} legacy receipts.`,
    );
  } finally {
    await closeFirebaseApp();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Review index migration failed.");
  process.exitCode = 1;
});
