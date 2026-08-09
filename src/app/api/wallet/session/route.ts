import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { WalletAuthError } from "@/server/wallet-auth/auth-service";
import { getWalletAuthService } from "@/server/wallet-auth/service";

const SESSION_COOKIE = "wrenpass_wallet_session";
const sessionRequestSchema = z.object({
  challengeId: z.string().trim().min(32).max(100),
  signature: z.string().trim().min(80).max(200),
});

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  const session = await getWalletAuthService().getSession(token);

  if (!session) {
    return Response.json(
      { authenticated: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { authenticated: true, address: session.address, expiresAt: session.expiresAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = sessionRequestSchema.parse(await request.json());
    const session = await getWalletAuthService().verifyChallenge(
      body.challengeId,
      body.signature,
    );
    const response = NextResponse.json(
      { authenticated: true, address: session.address, expiresAt: session.expiresAt },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(session.expiresAt),
      priority: "high",
    });
    return response;
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof WalletAuthError) {
      return Response.json(
        { error: error instanceof WalletAuthError ? error.message : "Invalid wallet signature." },
        { status: 400 },
      );
    }

    return Response.json({ error: "Unable to establish the wallet session." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  await getWalletAuthService().revokeSession(token);

  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
