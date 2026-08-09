import type { NextRequest } from "next/server";

import { CustomerServiceError } from "@/server/customer/customer-service";
import { getCustomerService } from "@/server/customer/service";
import { getRequestWalletAddress } from "@/server/wallet-auth/request-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const walletAddress = await getRequestWalletAddress(request);
  if (!walletAddress) {
    return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  }

  try {
    return Response.json(await getCustomerService().getDashboard(walletAddress), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CustomerServiceError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    return Response.json({ error: "Unable to load customer passes." }, { status: 503 });
  }
}
