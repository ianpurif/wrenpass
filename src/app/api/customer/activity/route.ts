import type { NextRequest } from "next/server";

import { getCustomerActivity } from "@/server/customer/service";
import { getRequestWalletAddress } from "@/server/wallet-auth/request-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const walletAddress = await getRequestWalletAddress(request);
  if (!walletAddress) {
    return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  }

  try {
    return Response.json(await getCustomerActivity(walletAddress), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Customer activity request failed.", error);
    return Response.json(
      { error: "Unable to load recent on-chain activity." },
      { status: 503 },
    );
  }
}
