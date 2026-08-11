import type { Metadata } from "next";

import { ReviewsFeed } from "@/components/reviews/reviews-feed";
import { Container } from "@/components/ui/container";
import type { ReviewPageDto } from "@/features/reviews/dto";
import { getReviewReader } from "@/server/reviews/reader-service";

export const metadata: Metadata = {
  title: "On-chain reviews | WrenPass",
  description:
    "Browse wallet-authorized reviews stored on Stellar by the WrenPass community.",
};

export const revalidate = 15;

async function loadInitialReviews(): Promise<{
  page: ReviewPageDto;
  error: string | null;
}> {
  try {
    const page = await getReviewReader().readPage({ limit: 12 });
    return {
      page,
      error: null,
    };
  } catch (error) {
    console.error("Unable to render on-chain reviews", error);
    return {
      page: { reviews: [], nextCursor: null, hasMore: false },
      error: "Reviews are temporarily unavailable. Try again in a moment.",
    };
  }
}

export default async function ReviewsPage() {
  const initial = await loadInitialReviews();

  return (
    <main
      id="main-content"
      className="min-h-[70vh] bg-workspace py-14 sm:py-18"
    >
      <Container>
        <header className="grid gap-6 border-b border-line pb-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">Public review ledger</p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.045em] text-ink sm:text-5xl">
              All reviews
            </h1>
          </div>
          <p className="text-sm font-semibold text-ink-faint">Newest first</p>
        </header>
        <section aria-label="On-chain reviews" className="pt-10">
          <ReviewsFeed
            initialError={initial.error}
            initialPage={initial.page}
          />
        </section>
      </Container>
    </main>
  );
}
