import type { NextRequest } from "next/server";

import {
  completeRedemptionRequestSchema,
  createRedemptionRequestSchema,
  submitRedemptionRequestSchema,
} from "@/features/redemption/dto";
import { RedemptionServiceError } from "@/server/redemption/redemption-service";
import { RedemptionRegistryError } from "@/server/redemption/redemption-registry";
import { getRedemptionService } from "@/server/redemption/service";
import { getRequestWalletAddress } from "@/server/wallet-auth/request-session";

export const runtime = "nodejs";

function handleRedemptionError(
  error: unknown,
  fallback: string,
  serviceStatus: number,
): Response {
  if (error instanceof RedemptionServiceError) {
    return Response.json({ error: error.message }, { status: serviceStatus });
  }
  if (error instanceof RedemptionRegistryError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  console.error(fallback, error);
  return Response.json({ error: fallback }, { status: 503 });
}

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
    return Response.json(await getRedemptionService().prepareRequest(merchant, parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleRedemptionError(error, "Unable to create the redemption request.", 400);
  }
}

export async function PUT(request: NextRequest) {
  const merchant = await getRequestWalletAddress(request);
  if (!merchant) return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  const parsed = submitRedemptionRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "The signed redemption request is invalid." }, { status: 400 });
  }
  try {
    return Response.json(await getRedemptionService().createRequest(merchant, parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleRedemptionError(error, "Unable to publish the redemption request.", 409);
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
    return handleRedemptionError(error, "Unable to confirm redemption.", 409);
  }
}
