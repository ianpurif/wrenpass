import { CinematicLanding } from "@/components/home/cinematic-landing";
import type { ReviewDto } from "@/features/reviews/dto";
import { getReviewReader } from "@/server/reviews/reader-service";

export const revalidate = 30;

export default async function Home() {
  let reviews: ReviewDto[] = [];
  try {
    const page = await getReviewReader().readPage({ limit: 6 });
    reviews = page.reviews;
  } catch (error) {
    console.error("Unable to render recent on-chain reviews", error);
  }

  return <CinematicLanding reviews={reviews} />;
}
