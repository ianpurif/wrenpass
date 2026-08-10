import type { NextRequest } from "next/server";
import { z } from "zod";

import { reviewInputSchema } from "@/features/reviews/validation";
import { ReviewSponsorshipError } from "@/server/reviews/review-sponsorship-service";
import { getReviewSponsorshipService } from "@/server/reviews/service";
import { getRequestWalletAddress } from "@/server/wallet-auth/request-session";

const sponsoredSubmissionSchema = reviewInputSchema.extend({
  signedAuthorizationEntry: z.string().min(1).max(200_000),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const reviewer = await getRequestWalletAddress(request);
  if (!reviewer) {
    return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  }
  const parsed = reviewInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "The review is invalid." }, { status: 400 });
  }

  try {
    return Response.json(await getReviewSponsorshipService().prepare(reviewer, parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof ReviewSponsorshipError
        ? error.message
        : "Sponsored reviews are temporarily unavailable.";
    if (!(error instanceof ReviewSponsorshipError)) {
      console.error("Unable to prepare sponsored review", error);
    }
    return Response.json(
      { error: message },
      { status: error instanceof ReviewSponsorshipError ? 400 : 503 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const reviewer = await getRequestWalletAddress(request);
  if (!reviewer) {
    return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  }
  const parsed = sponsoredSubmissionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "The signed review authorization is invalid." },
      { status: 400 },
    );
  }

  try {
    const result = await getReviewSponsorshipService().submit(reviewer, parsed.data);
    return Response.json(
      {
        reviewId: result.reviewId.toString(),
        transactionHash: result.transactionHash,
        ledger: result.ledger,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof ReviewSponsorshipError
        ? error.message
        : "The sponsored review could not be submitted.";
    if (!(error instanceof ReviewSponsorshipError)) {
      console.error("Unable to submit sponsored review", error);
    }
    return Response.json(
      { error: message },
      { status: error instanceof ReviewSponsorshipError ? 409 : 503 },
    );
  }
}
