// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type {
  OperationalStateStore,
  RateLimitRule,
} from "@/server/operations/operational-state-store";
import {
  DistributedReviewSponsorGuard,
  ReviewSponsorRateLimitError,
} from "@/server/reviews/review-sponsor-guard";

function createStore(): OperationalStateStore & { rules: RateLimitRule[][] } {
  const leases = new Map<string, string>();
  const rules: RateLimitRule[][] = [];
  return {
    rules,
    readEventCursor: vi.fn(async () => null),
    advanceEventCursor: vi.fn(async () => undefined),
    consumeRateLimits: vi.fn(async (nextRules) => {
      rules.push(nextRules);
      return { allowed: true, retryAfterSeconds: 0 };
    }),
    tryAcquireLease: vi.fn(async (id, ownerId) => {
      if (leases.has(id)) return false;
      leases.set(id, ownerId);
      return true;
    }),
    releaseLease: vi.fn(async (id, ownerId) => {
      if (leases.get(id) === ownerId) leases.delete(id);
    }),
  };
}

describe("DistributedReviewSponsorGuard", () => {
  it("uses hashed wallet keys, a global budget, and releases the sponsor lease", async () => {
    const store = createStore();
    const guard = new DistributedReviewSponsorGuard(
      store,
      () => new Date("2026-08-11T00:00:00.000Z"),
    );

    await expect(guard.checkPrepare("GTESTWALLET")).resolves.toBeUndefined();
    await expect(
      guard.runSubmission("GTESTWALLET", async () => "submitted"),
    ).resolves.toBe("submitted");

    expect(store.rules.flatMap((rules) => rules.map((rule) => rule.id)))
      .not.toContainEqual(expect.stringContaining("GTESTWALLET"));
    expect(store.rules[1]).toHaveLength(2);
    expect(store.releaseLease).toHaveBeenCalledTimes(1);
  });

  it("rejects a request without acquiring the sponsor lease when a budget is exhausted", async () => {
    const store = createStore();
    vi.mocked(store.consumeRateLimits).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 90,
    });
    const guard = new DistributedReviewSponsorGuard(store);

    await expect(guard.checkPrepare("GTESTWALLET")).rejects.toMatchObject({
      retryAfterSeconds: 90,
    } satisfies Partial<ReviewSponsorRateLimitError>);
    expect(store.tryAcquireLease).not.toHaveBeenCalled();
  });
});
