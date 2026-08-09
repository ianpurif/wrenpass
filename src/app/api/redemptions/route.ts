import type { NextRequest } from "next/server";

import {
  completeRedemptionRequestSchema,
  createRedemptionRequestSchema,
} from "@/features/redemption/dto";
import { RedemptionServiceError } from "@/server/redemption/redemption-service";
import { getRedemptionService } from "@/server/redemption/service";
import { getRequestWalletAddress } from "@/server/wallet-auth/request-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const owner = await getRequestWalletAddress(request);
  if (!owner) return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  return Response.json(await getRedemptionService().getPendingRequests(owner), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const merchant = await getRequestWalletAddress(request);
  if (!merchant) return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  const parsed = createRedemptionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "The redemption request is invalid." }, { status: 400 });
  }
  try {
    return Response.json(await getRedemptionService().createRequest(merchant, parsed.data));
  } catch (error) {
    const message =
      error instanceof RedemptionServiceError || error instanceof Error
        ? error.message
        : "Unable to create the redemption request.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const owner = await getRequestWalletAddress(request);
  if (!owner) return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  const parsed = completeRedemptionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "The redemption confirmation is invalid." }, { status: 400 });
  }
  try {
    await getRedemptionService().completeRequest(owner, parsed.data.requestId);
    return Response.json({ completed: true });
  } catch (error) {
    const message =
      error instanceof RedemptionServiceError || error instanceof Error
        ? error.message
        : "Unable to confirm redemption.";
    return Response.json({ error: message }, { status: 409 });
  }
}
