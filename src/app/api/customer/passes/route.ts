import type { NextRequest } from "next/server";

import { CustomerServiceError } from "@/server/customer/customer-service";
import { getCustomerDashboard } from "@/server/customer/service";
import { getRequestWalletAddress } from "@/server/wallet-auth/request-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const walletAddress = await getRequestWalletAddress(request);
  if (!walletAddress) {
    return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  }

  try {
    return Response.json(await getCustomerDashboard(walletAddress), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CustomerServiceError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("Customer dashboard request failed.", error);
    return Response.json({ error: "Unable to load customer passes." }, { status: 503 });
  }
}
