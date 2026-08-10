import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import { getServerEnv } from "@/server/env";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import { ReviewSponsorshipService } from "@/server/reviews/review-sponsorship-service";

let service: ReviewSponsorshipService | undefined;

export function getReviewSponsorshipService(): ReviewSponsorshipService {
  const repositories = createOffchainRepositories();
  service ??= new ReviewSponsorshipService(
    getStellarConfig(),
    getServerEnv().STELLAR_REVIEW_SPONSOR_SECRET,
    repositories.reviewReceipts,
  );
  return service;
}
