import type { NextRequest } from "next/server";

import { getEventSyncService } from "@/server/events/service";
import { getRequestWalletAddress } from "@/server/wallet-auth/request-session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await getRequestWalletAddress(request))) {
    return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  }
  try {
    return Response.json(await getEventSyncService().sync());
  } catch {
    return Response.json(
      { error: "Event sync is temporarily unavailable. The on-chain transaction is unaffected." },
      { status: 503 },
    );
  }
}
