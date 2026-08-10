import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import { ReviewReader } from "@/server/reviews/review-reader";

let reader: ReviewReader | undefined;

export function getReviewReader(): ReviewReader {
  const repositories = createOffchainRepositories();
  reader ??= new ReviewReader(
    getStellarConfig(),
    repositories.reviewReceipts,
  );
  return reader;
}
