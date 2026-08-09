// @vitest-environment node

import { createHash } from "node:crypto";

import { Keypair, Networks } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import {
  WalletAuthError,
  WalletAuthService,
  type WalletAuthChallenge,
  type WalletAuthSession,
  type WalletAuthStore,
} from "@/server/wallet-auth/auth-service";

class MemoryWalletAuthStore implements WalletAuthStore {
  challenges = new Map<string, WalletAuthChallenge>();
  sessions = new Map<string, WalletAuthSession>();

  async saveChallenge(challenge: WalletAuthChallenge) {
    this.challenges.set(challenge.idHash, challenge);
  }

  async readChallenge(idHash: string) {
    return this.challenges.get(idHash) ?? null;
  }

  async consumeChallenge(idHash: string) {
    const challenge = this.challenges.get(idHash) ?? null;
    if (challenge) this.challenges.delete(idHash);
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

function signMessage(keypair: Keypair, message: string) {
  const digest = createHash("sha256")
    .update(`Stellar Signed Message:\n${message}`, "utf8")
    .digest();
  return keypair.sign(digest).toString("base64");
}

describe("WalletAuthService", () => {
  it("creates a one-time signed challenge and an opaque server session", async () => {
    const store = new MemoryWalletAuthStore();
    const service = new WalletAuthService(store, {
      networkPassphrase: Networks.TESTNET,
      now: () => new Date("2026-08-09T00:00:00.000Z"),
    });
    const keypair = Keypair.random();
    const challenge = await service.createChallenge(keypair.publicKey(), "https://wrenpass.test");

    const session = await service.verifyChallenge(
      challenge.id,
      signMessage(keypair, challenge.message),
    );

    expect(session.token).not.toContain(keypair.publicKey());
    await expect(service.getSession(session.token)).resolves.toMatchObject({
      address: keypair.publicKey(),
    });
    await expect(
      service.verifyChallenge(challenge.id, signMessage(keypair, challenge.message)),
    ).rejects.toBeInstanceOf(WalletAuthError);
  });

  it("rejects a signature from a different wallet", async () => {
    const service = new WalletAuthService(new MemoryWalletAuthStore(), {
      networkPassphrase: Networks.TESTNET,
      now: () => new Date("2026-08-09T00:00:00.000Z"),
    });
    const expected = Keypair.random();
    const attacker = Keypair.random();
    const challenge = await service.createChallenge(expected.publicKey(), "https://wrenpass.test");

    await expect(
      service.verifyChallenge(challenge.id, signMessage(attacker, challenge.message)),
    ).rejects.toThrow(/signature/i);
  });

  it("rejects expired challenges and sessions", async () => {
    let now = new Date("2026-08-09T00:00:00.000Z");
    const service = new WalletAuthService(new MemoryWalletAuthStore(), {
      networkPassphrase: Networks.TESTNET,
      now: () => now,
      challengeTtlMs: 1_000,
      sessionTtlMs: 2_000,
    });
    const keypair = Keypair.random();
    const challenge = await service.createChallenge(keypair.publicKey(), "https://wrenpass.test");
    now = new Date("2026-08-09T00:00:02.000Z");

    await expect(
      service.verifyChallenge(challenge.id, signMessage(keypair, challenge.message)),
    ).rejects.toThrow(/expired/i);

    now = new Date("2026-08-09T00:00:00.000Z");
    const fresh = await service.createChallenge(keypair.publicKey(), "https://wrenpass.test");
    const session = await service.verifyChallenge(fresh.id, signMessage(keypair, fresh.message));
    now = new Date("2026-08-09T00:00:03.000Z");

    await expect(service.getSession(session.token)).resolves.toBeNull();
  });
});
