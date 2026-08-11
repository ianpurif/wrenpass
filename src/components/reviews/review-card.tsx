import { ExternalLink, Star } from "lucide-react";

import type { ReviewDto } from "@/features/reviews/dto";
import { shortenStellarAddress } from "@/features/merchant/display";
import { cn } from "@/lib/cn";
import { stellarTransactionUrl } from "@/lib/stellar/explorer";

function displayReviewDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function ReviewStars({ rating }: { rating: number }) {
  return (
    <span
      aria-label={`${rating} out of 5 stars`}
      className="flex gap-0.5 text-coral"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden="true"
          className="size-4"
          fill={star <= rating ? "currentColor" : "none"}
          strokeWidth={1.8}
        />
      ))}
    </span>
  );
}

export function ReviewCard({
  className,
  review,
  showFullAddress = false,
}: {
  className?: string;
  review: ReviewDto;
  showFullAddress?: boolean;
}) {
  return (
    <article
      className={cn(
        "flex h-full min-w-0 flex-col rounded-2xl border border-line bg-white p-6 shadow-soft",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <ReviewStars rating={review.rating} />
        {review.transactionHash ? (
          <a
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-forest transition hover:bg-mint-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
            href={stellarTransactionUrl(review.network, review.transactionHash)}
            rel="noreferrer noopener"
            target="_blank"
          >
            View on-chain{" "}
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        ) : (
          <span className="text-xs font-semibold text-ink-faint">
            Confirmation pending
          </span>
        )}
      </div>
      <blockquote className="mt-6 flex-1 text-lg font-semibold leading-8 tracking-[-0.015em] text-ink">
        &ldquo;{review.message}&rdquo;
      </blockquote>
      <footer className="mt-7 border-t border-line pt-4">
        <p
          className={cn(
            "font-mono text-xs font-semibold text-ink",
            showFullAddress && "break-all leading-5",
          )}
          title={review.reviewer}
        >
          {showFullAddress
            ? review.reviewer
            : shortenStellarAddress(review.reviewer)}
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          {displayReviewDate(review.createdAt)}
        </p>
      </footer>
    </article>
  );
}
