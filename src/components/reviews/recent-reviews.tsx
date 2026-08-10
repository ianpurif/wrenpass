"use client";

import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { ReviewCard } from "@/components/reviews/review-card";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import type { ReviewDto } from "@/features/reviews/dto";

export function RecentReviews({ reviews }: { reviews: ReviewDto[] }) {
  const carouselRef = useRef<HTMLDivElement>(null);

  function move(direction: -1 | 1) {
    const carousel = carouselRef.current;
    if (!carousel) return;
    carousel.scrollBy({
      behavior: "smooth",
      left: direction * Math.max(280, carousel.clientWidth * 0.72),
    });
  }

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
            {reviews.length > 1 && (
              <>
                <Button aria-label="Previous reviews" className="size-11 px-0" variant="secondary" onClick={() => move(-1)}>
                  <ArrowLeft aria-hidden="true" className="size-4" />
                </Button>
                <Button aria-label="Next reviews" className="size-11 px-0" variant="secondary" onClick={() => move(1)}>
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
              </>
            )}
            <Link className="ml-1 inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold text-forest transition hover:bg-mint-soft" href="/reviews">
              All reviews <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>

        {reviews.length ? (
          <div
            ref={carouselRef}
            aria-label="Recent on-chain reviews"
            className="mt-14 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {reviews.map((review, index) => (
              <motion.div
                key={review.id}
                className="w-[min(86vw,23rem)] shrink-0 snap-start sm:w-[23rem] lg:w-[25rem]"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.06, 0.24), duration: 0.45 }}
                viewport={{ once: true, amount: 0.25 }}
              >
                <ReviewCard review={review} />
              </motion.div>
            ))}
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
