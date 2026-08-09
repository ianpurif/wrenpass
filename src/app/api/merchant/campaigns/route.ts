import { NextRequest } from "next/server";
import { z } from "zod";

import { MerchantServiceError } from "@/server/merchant/merchant-service";
import { getMerchantService } from "@/server/merchant/service";
import { getRequestWalletAddress } from "@/server/wallet-auth/request-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const walletAddress = await getRequestWalletAddress(request);
  if (!walletAddress) return Response.json({ error: "Connect your wallet first." }, { status: 401 });

  try {
    return Response.json(await getMerchantService().getDashboard(walletAddress), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Unable to load merchant campaigns." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const walletAddress = await getRequestWalletAddress(request);
  if (!walletAddress) return Response.json({ error: "Connect your wallet first." }, { status: 401 });

  try {
    const metadata = await getMerchantService().saveCampaignMetadata(
      walletAddress,
      await request.json(),
    );
    return Response.json({ metadata }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof MerchantServiceError) {
      return Response.json(
        { error: error instanceof MerchantServiceError ? error.message : "Check the campaign details." },
        { status: 400 },
      );
    }
    return Response.json({ error: "Unable to register campaign metadata." }, { status: 503 });
  }
}
