import { CinematicLanding } from "@/components/home/cinematic-landing";
import type { ReviewPageDto } from "@/features/reviews/dto";
import { getReviewReader } from "@/server/reviews/reader-service";

export const revalidate = 30;

export default async function Home() {
  let reviewPage: ReviewPageDto = { reviews: [], nextCursor: null, hasMore: false };
  try {
    reviewPage = await getReviewReader().readPage({ limit: 12 });
  } catch (error) {
    console.error("Unable to render recent on-chain reviews", error);
  }

  return <CinematicLanding reviewPage={reviewPage} />;
}
