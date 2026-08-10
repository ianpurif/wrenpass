import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getReviewReader } from "@/server/reviews/reader-service";

const querySchema = z.object({
  before: z.string().regex(/^[1-9]\d*$/).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(12),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    before: request.nextUrl.searchParams.get("before") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid review page request." }, { status: 400 });
  }

  try {
    const page = await getReviewReader().readPage({
      beforeId: parsed.data.before ? BigInt(parsed.data.before) : undefined,
      limit: parsed.data.limit,
    });
    return NextResponse.json(
      page,
      {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    console.error("Unable to read on-chain reviews", error);
    return NextResponse.json({ error: "Reviews are temporarily unavailable." }, { status: 503 });
  }
}
