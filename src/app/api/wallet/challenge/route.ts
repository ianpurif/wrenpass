import { NextRequest } from "next/server";
import { z } from "zod";

import { StellarAccountNotFoundError } from "@/server/stellar/balance-service";
import { getStellarBalanceService } from "@/server/stellar/services";
import { WalletAuthError } from "@/server/wallet-auth/auth-service";
import { getWalletAuthService } from "@/server/wallet-auth/service";

const challengeRequestSchema = z.object({
  address: z.string().trim().max(80),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = challengeRequestSchema.parse(await request.json());

    // Requiring an existing Testnet account prevents challenges for arbitrary unfunded addresses.
    await getStellarBalanceService().getBalances(body.address);
    const challenge = await getWalletAuthService().createChallenge(
      body.address,
      request.nextUrl.origin,
    );
    return Response.json(challenge, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof WalletAuthError) {
      return Response.json(
        { error: error instanceof WalletAuthError ? error.message : "Invalid wallet address." },
        { status: 400 },
      );
    }

    if (error instanceof StellarAccountNotFoundError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json(
      { error: "Unable to create a wallet sign-in challenge." },
      { status: 503 },
    );
  }
}
