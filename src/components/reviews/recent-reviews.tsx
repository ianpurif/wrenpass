"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ReviewCard } from "@/components/reviews/review-card";
import { Container } from "@/components/ui/container";
import { reviewsApi } from "@/features/reviews/api";
import type { ReviewDto, ReviewPageDto } from "@/features/reviews/dto";

const REVIEW_PAGE_SIZE = 12;
const VIRTUAL_WINDOW_SIZE = 7;
const VIRTUAL_BUFFER = 2;
const VIRTUAL_SHIFT = 2;

export function RecentReviews({
  reviews = [],
  initialPage,
}: {
  reviews?: ReviewDto[];
  initialPage?: ReviewPageDto;
}) {
  const initialReviews = initialPage?.reviews ?? reviews;
  const [loadedReviews, setLoadedReviews] = useState(initialReviews);
  const [nextCursor, setNextCursor] = useState(initialPage?.nextCursor ?? null);
  const [hasMore, setHasMore] = useState(initialPage?.hasMore ?? false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const cardStepRef = useRef(400);
  const windowStartRef = useRef(0);
  const [windowStart, setWindowStart] = useState(0);
  const initializedRef = useRef(false);
  const normalizingRef = useRef(false);
  const loadingMoreRef = useRef(false);

  const measureCardStep = useCallback(() => {
    const carousel = carouselRef.current;
    const card = carousel?.querySelector<HTMLElement>("[data-review-card]");
    if (!carousel || !card) return cardStepRef.current;

    const gap = Number.parseFloat(getComputedStyle(carousel).columnGap || "20") || 20;
    const width = card.getBoundingClientRect().width || card.offsetWidth;
    if (width > 0) cardStepRef.current = width + gap;
    return cardStepRef.current;
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    try {
      const page = await reviewsApi.list({ beforeId: nextCursor, limit: REVIEW_PAGE_SIZE });
      setLoadedReviews((current) => {
        const knownIds = new Set(current.map((review) => review.id));
        return [...current, ...page.reviews.filter((review) => !knownIds.has(review.id))];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (error) {
      console.error("Unable to load more recent reviews", error);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [hasMore, nextCursor]);

  useLayoutEffect(() => {
    if (loadedReviews.length < 2 || initializedRef.current) return;
    const carousel = carouselRef.current;
    if (!carousel) return;
    carousel.scrollLeft = measureCardStep() * VIRTUAL_BUFFER;
    initializedRef.current = true;
  }, [loadedReviews.length, measureCardStep]);

  useEffect(() => {
    if (loadedReviews.length < 2) return;

    function handleResize() {
      const carousel = carouselRef.current;
      if (!carousel) return;
      const previousStep = cardStepRef.current;
      const nextStep = measureCardStep();
      if (previousStep > 0 && nextStep > 0) {
        carousel.scrollLeft = (carousel.scrollLeft / previousStep) * nextStep;
      }
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [loadedReviews.length, measureCardStep]);

  const maybeLoadMore = useCallback((nextStart: number) => {
    if (hasMore && nextStart + VIRTUAL_WINDOW_SIZE >= loadedReviews.length - VIRTUAL_BUFFER) {
      void loadMore();
    }
  }, [hasMore, loadMore, loadedReviews.length]);

  const normalizeWindow = useCallback(() => {
    const carousel = carouselRef.current;
    if (!carousel || loadedReviews.length < 2 || normalizingRef.current) return;

    const step = measureCardStep();
    const highThreshold = step * (VIRTUAL_WINDOW_SIZE - VIRTUAL_BUFFER - 1);
    const lowThreshold = step * (VIRTUAL_BUFFER - 1);
    let shift = 0;

    if (carousel.scrollLeft > highThreshold) shift = VIRTUAL_SHIFT;
    if (carousel.scrollLeft < lowThreshold) shift = -VIRTUAL_SHIFT;
    if (!shift) return;

    const nextStart = windowStartRef.current + shift;
    windowStartRef.current = nextStart;
    setWindowStart(nextStart);
    maybeLoadMore(nextStart);
    normalizingRef.current = true;
    carousel.scrollLeft -= step * shift;
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => { normalizingRef.current = false; });
    } else {
      normalizingRef.current = false;
    }
  }, [loadedReviews.length, measureCardStep, maybeLoadMore]);

  const handleWheel = useCallback((event: WheelEvent) => {
    if (loadedReviews.length < 2) return;
    // Trackpads can report both axes at once. Use the dominant axis so a
    // diagonal gesture never cancels itself out and leaves the page scrolling.
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;

    event.preventDefault();
    carouselRef.current?.scrollBy({
      behavior: "smooth",
      left: Math.sign(delta) * Math.min(Math.abs(delta) * 1.35, 180),
    });
  }, [loadedReviews.length]);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    carousel.addEventListener("wheel", handleWheel, { passive: false });
    return () => carousel.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  function reviewAt(index: number): ReviewDto | null {
    if (!loadedReviews.length) return null;
    const normalizedIndex = ((index % loadedReviews.length) + loadedReviews.length) % loadedReviews.length;
    return loadedReviews[normalizedIndex];
  }

  // Keep the DOM bounded to a small viewport window. Modulo indexing only
  // repeats the sequence when a short review list cannot fill that window;
  // the complete review collection is never duplicated into the DOM.
  const renderedCount = loadedReviews.length > 1 ? VIRTUAL_WINDOW_SIZE : loadedReviews.length;

  return (
    <section aria-labelledby="recent-reviews-title" className="border-b border-line bg-white py-24 sm:py-32 lg:py-36">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">Wallet-authorized feedback</p>
            <h2 id="recent-reviews-title" className="landing-display mt-5 max-w-[12ch] text-[clamp(3rem,6vw,6rem)] leading-[0.9] tracking-[-0.06em] text-ink">
              What people say after using WrenPass.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-ink-muted">Every review is submitted by a Stellar wallet and read directly from the public review contract.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Link className="ml-1 inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold text-forest transition hover:bg-mint-soft" href="/reviews">
              All reviews <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>

        {loadedReviews.length ? (
          <div
            ref={carouselRef}
            aria-label="Recent on-chain reviews. Hover and scroll up or down to browse horizontally."
            aria-roledescription="carousel"
            className="mt-14 flex snap-x snap-proximity gap-5 overflow-x-auto overscroll-x-contain scroll-smooth pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="region"
            tabIndex={0}
            onScroll={normalizeWindow}
          >
            {Array.from({ length: renderedCount }, (_, index) => {
              const absoluteIndex = windowStart + index;
              const review = reviewAt(absoluteIndex);
              if (!review) return null;
              return (
                <motion.div
                  data-review-card
                  key={index}
                  className="w-[min(86vw,23rem)] shrink-0 snap-start sm:w-[23rem] lg:w-[25rem]"
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.06, 0.24), duration: 0.45 }}
                  viewport={{ once: true, amount: 0.25 }}
                >
                  <ReviewCard review={review} />
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="mt-14 border-y border-line py-10">
            <p className="font-bold text-ink">No reviews have been published yet.</p>
            <p className="mt-2 text-sm leading-6 text-ink-muted">The first wallet-authorized review will appear here after a completed WrenPass transaction.</p>
          </div>
        )}
      </Container>
    </section>
  );
}
