import type { NextRequest } from "next/server";
import { z } from "zod";

import { RedemptionServiceError } from "@/server/redemption/redemption-service";
import { getRedemptionService } from "@/server/redemption/service";
import { getRequestWalletAddress } from "@/server/wallet-auth/request-session";

export const runtime = "nodejs";

const requestSchema = z.object({ qrPayload: z.string().min(1).max(512) });

export async function POST(request: NextRequest) {
  const merchant = await getRequestWalletAddress(request);
  if (!merchant) return Response.json({ error: "Connect your wallet first." }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "The scanned QR payload is invalid." }, { status: 400 });
  }
  try {
    return Response.json(
      await getRedemptionService().validateMerchantScan(merchant, parsed.data.qrPayload),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof RedemptionServiceError || error instanceof Error
        ? error.message
        : "Unable to validate this pass.";
    return Response.json({ error: message }, { status: 400 });
  }
}
