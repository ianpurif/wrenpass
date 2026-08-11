import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  campaignIdSchema,
  InvalidCampaignTransactionCursorError,
} from "@/server/campaign-transactions/campaign-event-key";
import { getCampaignTransactionIndex } from "@/server/campaign-transactions/service";

const querySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/campaigns/[campaignId]/transactions">,
) {
  const { campaignId: rawCampaignId } = await context.params;
  const campaignId = campaignIdSchema.safeParse(rawCampaignId);
  const query = querySchema.safeParse({
    cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!campaignId.success || !query.success) {
    return NextResponse.json(
      { error: "Invalid campaign transaction page request." },
      { status: 400 },
    );
  }

  try {
    const page = await getCampaignTransactionIndex().readPage({
      campaignId: campaignId.data,
      cursor: query.data.cursor,
      limit: query.data.limit,
    });
    return NextResponse.json(page, {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    if (error instanceof InvalidCampaignTransactionCursorError) {
      return NextResponse.json(
        { error: "Invalid campaign transaction cursor." },
        { status: 400 },
      );
    }
    console.error("Unable to read campaign transactions", error);
    return NextResponse.json(
      { error: "Campaign transactions are temporarily unavailable." },
      { status: 503 },
    );
  }
}
