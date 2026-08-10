"use client";

import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ReviewCard } from "@/components/reviews/review-card";
import { Button } from "@/components/ui/button";
import { reviewsApi } from "@/features/reviews/api";
import type { ReviewPageDto } from "@/features/reviews/dto";

const PAGE_SIZE = 12;

export function ReviewsFeed({
  initialError = null,
  initialPage,
}: {
  initialError?: string | null;
  initialPage: ReviewPageDto;
}) {
  const [reviews, setReviews] = useState(initialPage.reviews);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async (reset = false) => {
    if (loadingRef.current || (!reset && !hasMore)) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const page = await reviewsApi.list({
        beforeId: reset ? undefined : nextCursor ?? undefined,
        limit: PAGE_SIZE,
      });
      setReviews((current) => {
        const next = reset ? [] : current;
        const knownIds = new Set(next.map((review) => review.id));
        return [...next, ...page.reviews.filter((review) => !knownIds.has(review.id))];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Reviews are temporarily unavailable.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, nextCursor]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadPage();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadPage]);

  return (
    <div>
      {reviews.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} showFullAddress />
          ))}
        </div>
      ) : !error ? (
        <div className="border-y border-line py-12 text-center">
          <p className="font-bold text-ink">No on-chain reviews yet.</p>
          <p className="mt-2 text-sm text-ink-muted">Completed transactions will invite the first reviews.</p>
        </div>
      ) : null}

      {error && (
        <div className="mt-8 rounded-xl border border-danger/20 bg-danger-soft p-5 text-center">
          <p role="alert" className="text-sm font-semibold text-danger-strong">{error}</p>
          <Button className="mt-4" size="sm" variant="secondary" disabled={loading} onClick={() => void loadPage(reviews.length === 0)}>
            Try again
          </Button>
        </div>
      )}

      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      {loading && (
        <p role="status" className="mt-8 flex items-center justify-center gap-2 text-sm font-semibold text-ink-muted">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Loading more on-chain reviews
        </p>
      )}
      {!hasMore && reviews.length > 0 && !error && (
        <p className="mt-10 text-center text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">You reached the beginning of the review ledger</p>
      )}
    </div>
  );
}
