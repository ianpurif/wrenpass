import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { Keypair, StrKey } from "@stellar/stellar-sdk";

const SIGNED_MESSAGE_PREFIX = "Stellar Signed Message:\n";
const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1_000;

export interface WalletAuthChallenge {
  idHash: string;
  address: string;
  message: string;
  expiresAt: string;
}

export interface WalletAuthSession {
  tokenHash: string;
  address: string;
  createdAt: string;
  expiresAt: string;
}

export interface WalletAuthStore {
  saveChallenge(challenge: WalletAuthChallenge): Promise<void>;
  readChallenge(idHash: string): Promise<WalletAuthChallenge | null>;
  consumeChallenge(idHash: string): Promise<WalletAuthChallenge | null>;
  saveSession(session: WalletAuthSession): Promise<void>;
  readSession(tokenHash: string): Promise<WalletAuthSession | null>;
  removeSession(tokenHash: string): Promise<void>;
}

interface WalletAuthOptions {
  networkPassphrase: string;
  now?: () => Date;
  challengeTtlMs?: number;
  sessionTtlMs?: number;
}

export class WalletAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletAuthError";
  }
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function validateOrigin(origin: string): string {
  const parsed = new URL(origin);
  const isLocal = ["localhost", "127.0.0.1"].includes(parsed.hostname);

  if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
    throw new WalletAuthError("Wallet sign-in requires HTTPS outside local development.");
  }

  return parsed.origin;
}

function verifySep53Signature(address: string, message: string, signature: string): boolean {
  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(signature, "base64");
  } catch {
    return false;
  }

  if (signatureBytes.length !== 64) return false;

  const digest = createHash("sha256")
    .update(`${SIGNED_MESSAGE_PREFIX}${message}`, "utf8")
    .digest();

  return Keypair.fromPublicKey(address).verify(digest, signatureBytes);
}

export class WalletAuthService {
  private readonly now: () => Date;
  private readonly challengeTtlMs: number;
  private readonly sessionTtlMs: number;

  constructor(
    private readonly store: WalletAuthStore,
    private readonly options: WalletAuthOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.challengeTtlMs = options.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  }

  async createChallenge(
    address: string,
    origin: string,
  ): Promise<{ id: string; message: string; expiresAt: string }> {
    if (!StrKey.isValidEd25519PublicKey(address)) {
      throw new WalletAuthError("A valid Stellar account address is required.");
    }

    const safeOrigin = validateOrigin(origin);
    const issuedAt = this.now();
    const expiresAt = new Date(issuedAt.getTime() + this.challengeTtlMs);
    const id = createOpaqueToken();
    const nonce = createOpaqueToken();
    const message = [
      "Sign in to WrenPass",
      "",
      `Origin: ${safeOrigin}`,
      `Address: ${address}`,
      `Network: ${this.options.networkPassphrase}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt.toISOString()}`,
      `Expires At: ${expiresAt.toISOString()}`,
      "",
      "This request does not submit a transaction or move funds.",
    ].join("\n");

    await this.store.saveChallenge({
      idHash: hashOpaqueToken(id),
      address,
      message,
      expiresAt: expiresAt.toISOString(),
    });

    return { id, message, expiresAt: expiresAt.toISOString() };
  }

  async verifyChallenge(
    challengeId: string,
    signature: string,
  ): Promise<{ token: string; address: string; expiresAt: string }> {
    const idHash = hashOpaqueToken(challengeId);
    const challenge = await this.store.readChallenge(idHash);

    if (!challenge) {
      throw new WalletAuthError("Wallet challenge is invalid or has already been used.");
    }

    if (new Date(challenge.expiresAt).getTime() <= this.now().getTime()) {
      await this.store.consumeChallenge(idHash);
      throw new WalletAuthError("Wallet challenge has expired.");
    }

    if (!verifySep53Signature(challenge.address, challenge.message, signature)) {
      throw new WalletAuthError("Wallet signature could not be verified.");
    }

    const consumed = await this.store.consumeChallenge(idHash);
    if (!consumed) {
      throw new WalletAuthError("Wallet challenge is invalid or has already been used.");
    }

    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.sessionTtlMs);
    const token = createOpaqueToken();
    await this.store.saveSession({
      tokenHash: hashOpaqueToken(token),
      address: challenge.address,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    return { token, address: challenge.address, expiresAt: expiresAt.toISOString() };
  }

  async getSession(token: string): Promise<WalletAuthSession | null> {
    if (!token) return null;

    const tokenHash = hashOpaqueToken(token);
    const session = await this.store.readSession(tokenHash);
    if (!session) return null;

    if (new Date(session.expiresAt).getTime() <= this.now().getTime()) {
      await this.store.removeSession(tokenHash);
      return null;
    }

    return session;
  }

  async revokeSession(token: string): Promise<void> {
    if (token) await this.store.removeSession(hashOpaqueToken(token));
  }
}
