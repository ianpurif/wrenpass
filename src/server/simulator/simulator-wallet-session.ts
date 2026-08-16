import "server-only";

import type { Keypair } from "@stellar/stellar-sdk";

import {
  createSep53MessageDigest,
  type WalletAuthService,
} from "@/server/wallet-auth/auth-service";

type SimulatorWalletAuthService = Pick<
  WalletAuthService,
  "createChallenge" | "verifyChallenge"
>;

export async function connectSimulatorWallet(
  authService: SimulatorWalletAuthService,
  keypair: Keypair,
  origin: string,
): Promise<{ expiresAt: string }> {
  const challenge = await authService.createChallenge(keypair.publicKey(), origin);
  const signature = keypair
    .sign(createSep53MessageDigest(challenge.message))
    .toString("base64");
  const session = await authService.verifyChallenge(challenge.id, signature);

  if (session.address !== keypair.publicKey()) {
    throw new Error("The simulator wallet session was created for a different account.");
  }

  return { expiresAt: session.expiresAt };
}
