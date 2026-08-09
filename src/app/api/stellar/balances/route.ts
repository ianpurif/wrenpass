import { NextRequest } from "next/server";

import {
  StellarAccountNotFoundError,
  StellarNetworkMismatchError,
  StellarRpcUnavailableError,
} from "@/server/stellar/balance-service";
import { getStellarBalanceService } from "@/server/stellar/services";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address") ?? "";

  try {
    const balances = await getStellarBalanceService().getBalances(address);
    return Response.json(balances, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof StellarAccountNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }

    if (
      error instanceof StellarNetworkMismatchError ||
      error instanceof StellarRpcUnavailableError
    ) {
      return Response.json({ error: error.message }, { status: 503 });
    }

    if (error instanceof Error && /address/i.test(error.message)) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ error: "Unable to load Stellar balances." }, { status: 500 });
  }
}
