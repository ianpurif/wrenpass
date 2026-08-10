import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { reviewInputSchema } from "@/features/reviews/validation";
import {
  ReviewSponsorshipError,
  ReviewSponsorshipRateLimitError,
} from "@/server/reviews/review-sponsorship-service";
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
      Sentry.captureException(error, { tags: { operation: "review-sponsor-prepare" } });
      console.error("Unable to prepare sponsored review", error);
    }
    const rateLimit = error instanceof ReviewSponsorshipRateLimitError;
    return Response.json(
      { error: message },
      {
        status: rateLimit ? 429 : error instanceof ReviewSponsorshipError ? 400 : 503,
        ...(rateLimit
          ? { headers: { "Retry-After": String(error.retryAfterSeconds) } }
          : {}),
      },
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
      Sentry.captureException(error, { tags: { operation: "review-sponsor-submit" } });
      console.error("Unable to submit sponsored review", error);
    }
    const rateLimit = error instanceof ReviewSponsorshipRateLimitError;
    return Response.json(
      { error: message },
      {
        status: rateLimit ? 429 : error instanceof ReviewSponsorshipError ? 409 : 503,
        ...(rateLimit
          ? { headers: { "Retry-After": String(error.retryAfterSeconds) } }
          : {}),
      },
    );
  }
}
