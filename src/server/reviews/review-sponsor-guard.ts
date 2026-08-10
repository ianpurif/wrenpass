import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { OperationalStateStore } from "@/server/operations/operational-state-store";

const PREPARE_WINDOW_MS = 5 * 60 * 1_000;
const SUBMIT_WINDOW_MS = 60 * 60 * 1_000;
const SUBMISSION_LEASE_MS = 2 * 60 * 1_000;

export class ReviewSponsorRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many sponsored review requests. Try again later.");
  }
}

export class ReviewSponsorBusyError extends Error {
  constructor() {
    super("The review sponsor is busy. Try again shortly.");
  }
}

export interface ReviewSponsorGuard {
  checkPrepare(reviewer: string): Promise<void>;
  runSubmission<T>(reviewer: string, task: () => Promise<T>): Promise<T>;
}

function reviewerKey(reviewer: string): string {
  return createHash("sha256").update(reviewer).digest("hex");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class DistributedReviewSponsorGuard implements ReviewSponsorGuard {
  constructor(
    private readonly store: OperationalStateStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async enforce(rules: Parameters<OperationalStateStore["consumeRateLimits"]>[0]) {
    const decision = await this.store.consumeRateLimits(rules, this.now());
    if (!decision.allowed) {
      throw new ReviewSponsorRateLimitError(decision.retryAfterSeconds);
    }
  }

  async checkPrepare(reviewer: string): Promise<void> {
    await this.enforce([
      {
        id: `review-prepare-${reviewerKey(reviewer)}`,
        limit: 12,
        windowMs: PREPARE_WINDOW_MS,
      },
    ]);
  }

  async runSubmission<T>(reviewer: string, task: () => Promise<T>): Promise<T> {
    await this.enforce([
      {
        id: `review-submit-${reviewerKey(reviewer)}`,
        limit: 3,
        windowMs: SUBMIT_WINDOW_MS,
      },
      {
        id: "review-submit-global",
        limit: 100,
        windowMs: SUBMIT_WINDOW_MS,
      },
    ]);

    const leaseId = "review-sponsor-sequence";
    const ownerId = randomUUID();
    let acquired = false;
    for (let attempt = 0; attempt < 4 && !acquired; attempt += 1) {
      acquired = await this.store.tryAcquireLease(
        leaseId,
        ownerId,
        this.now(),
        SUBMISSION_LEASE_MS,
      );
      if (!acquired && attempt < 3) await delay(250 * (attempt + 1));
    }
    if (!acquired) throw new ReviewSponsorBusyError();

    try {
      return await task();
    } finally {
      await this.store.releaseLease(leaseId, ownerId);
    }
  }
}
