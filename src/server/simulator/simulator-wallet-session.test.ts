// @vitest-environment node

import { Keypair, Networks } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { connectSimulatorWallet } from "@/server/simulator/simulator-wallet-session";
import {
  WalletAuthService,
  type WalletAuthChallenge,
  type WalletAuthSession,
  type WalletAuthStore,
} from "@/server/wallet-auth/auth-service";

class MemoryWalletAuthStore implements WalletAuthStore {
  readonly challenges = new Map<string, WalletAuthChallenge>();
  readonly sessions = new Map<string, WalletAuthSession>();

  async saveChallenge(challenge: WalletAuthChallenge) {
    this.challenges.set(challenge.idHash, challenge);
  }

  async readChallenge(idHash: string) {
    return this.challenges.get(idHash) ?? null;
  }

  async consumeChallenge(idHash: string) {
    const challenge = this.challenges.get(idHash) ?? null;
    this.challenges.delete(idHash);
    return challenge;
  }

  async saveSession(session: WalletAuthSession) {
    this.sessions.set(session.tokenHash, session);
  }

  async readSession(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }

  async removeSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
}

describe("connectSimulatorWallet", () => {
  it("uses the normal signed challenge flow and retains no wallet secret", async () => {
    const store = new MemoryWalletAuthStore();
    const authService = new WalletAuthService(store, {
      networkPassphrase: Networks.TESTNET,
      now: () => new Date("2026-08-16T00:00:00.000Z"),
    });
    const wallet = Keypair.random();

    await expect(
      connectSimulatorWallet(authService, wallet, "https://wrenpass.vercel.app"),
    ).resolves.toEqual({ expiresAt: "2026-08-17T00:00:00.000Z" });

    expect(store.challenges.size).toBe(0);
    expect([...store.sessions.values()]).toEqual([
      expect.objectContaining({ address: wallet.publicKey() }),
    ]);
    expect(JSON.stringify([...store.sessions.values()])).not.toContain(wallet.secret());
  });
});
