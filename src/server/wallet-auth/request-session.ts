import "server-only";

import type { NextRequest } from "next/server";

import { getWalletAuthService } from "@/server/wallet-auth/service";

export const WALLET_SESSION_COOKIE = "wrenpass_wallet_session";

export async function getRequestWalletAddress(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(WALLET_SESSION_COOKIE)?.value ?? "";
  const session = await getWalletAuthService().getSession(token);
  return session?.address ?? null;
}
