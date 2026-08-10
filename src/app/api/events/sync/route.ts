import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { syncEvents } from "@/server/events/service";
import { getRequestWalletAddress } from "@/server/wallet-auth/request-session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await getRequestWalletAddress(request))) {
    return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  }
  try {
    return Response.json(await syncEvents());
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: "event-sync" } });
    console.error("Event synchronization failed.", error);
    return Response.json(
      { error: "Event sync is temporarily unavailable. The on-chain transaction is unaffected." },
      { status: 503 },
    );
  }
}
