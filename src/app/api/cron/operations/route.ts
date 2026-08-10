import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { getServerEnv } from "@/server/env";
import { hasValidCronAuthorization } from "@/server/operations/cron-auth";
import { getScheduledOperationsService } from "@/server/operations/operations-service";

export const runtime = "nodejs";

function authorized(request: NextRequest): boolean {
  return hasValidCronAuthorization(
    request.headers.get("authorization"),
    getServerEnv().CRON_SECRET,
  );
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return Response.json(await getScheduledOperationsService().run(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: "scheduled-operations" } });
    console.error("Scheduled operations failed.", error);
    return Response.json(
      { error: "Scheduled operations are temporarily unavailable." },
      { status: 503 },
    );
  }
}
