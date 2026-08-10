import type { NextRequest } from "next/server";
import { z } from "zod";

import { createOffchainRepositories } from "@/server/firestore/repositories";
import { userProfileSchema } from "@/server/models";
import { getRequestWalletAddress } from "@/server/wallet-auth/request-session";

export const runtime = "nodejs";

const updateSchema = z.object({ email: z.email().max(254) });

export async function GET(request: NextRequest) {
  const walletAddress = await getRequestWalletAddress(request);
  if (!walletAddress) return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  try {
    const profile = await createOffchainRepositories().userProfiles.findById(walletAddress);
    return Response.json({ email: profile?.email ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to load notification settings." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const walletAddress = await getRequestWalletAddress(request);
  if (!walletAddress) return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });

  try {
    const repositories = createOffchainRepositories();
    const existing = await repositories.userProfiles.findById(walletAddress);
    const timestamp = new Date().toISOString();
    const profile = await repositories.userProfiles.save(
      userProfileSchema.parse({
        id: walletAddress,
        email: parsed.data.email,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }),
    );
    return Response.json({ email: profile.email });
  } catch {
    return Response.json({ error: "Unable to save notification settings." }, { status: 503 });
  }
}
