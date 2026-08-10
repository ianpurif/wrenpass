import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import { getServerEnv } from "@/server/env";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import { ReviewSponsorshipService } from "@/server/reviews/review-sponsorship-service";
import { FirestoreOperationalStateStore } from "@/server/operations/operational-state-store";
import { DistributedReviewSponsorGuard } from "@/server/reviews/review-sponsor-guard";

let service: ReviewSponsorshipService | undefined;

export function getReviewSponsorshipService(): ReviewSponsorshipService {
  const repositories = createOffchainRepositories();
  service ??= new ReviewSponsorshipService(
    getStellarConfig(),
    getServerEnv().STELLAR_REVIEW_SPONSOR_SECRET,
    repositories.indexedBlockchainEvents,
    new DistributedReviewSponsorGuard(new FirestoreOperationalStateStore()),
  );
  return service;
}
