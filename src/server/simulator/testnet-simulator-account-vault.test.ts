// @vitest-environment node

import {
  constants,
  generateKeyPairSync,
  privateDecrypt,
} from "node:crypto";

import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  FirestoreTestnetSimulatorAccountStore,
  RsaEncryptedTestnetSimulatorAccountVault,
  type TestnetSimulatorAccountRecord,
  type TestnetSimulatorAccountStore,
} from "@/server/simulator/testnet-simulator-account-vault";
import type { Firestore } from "firebase-admin/firestore";

function rsaKeyPair(modulusLength = 3_072) {
  return generateKeyPairSync("rsa", {
    modulusLength,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

describe("RsaEncryptedTestnetSimulatorAccountVault", () => {
  it("stores only the public address, encrypted secret, and timestamp", async () => {
    const keys = rsaKeyPair();
    const create = vi.fn<(record: TestnetSimulatorAccountRecord) => Promise<void>>()
      .mockResolvedValue(undefined);
    const store: TestnetSimulatorAccountStore = { create };
    const vault = new RsaEncryptedTestnetSimulatorAccountVault(
      keys.publicKey,
      store,
      () => new Date("2026-08-17T00:00:00.000Z"),
    );
    const wallet = Keypair.random();

    await vault.persist(wallet);

    const record = create.mock.calls[0][0];
    expect(Object.keys(record).sort()).toEqual([
      "created_at",
      "encrypted_secret",
      "public_key",
    ]);
    expect(record.public_key).toBe(wallet.publicKey());
    expect(record.encrypted_secret).not.toContain(wallet.secret());
    expect(privateDecrypt(
      {
        key: keys.privateKey,
        oaepHash: "sha256",
        padding: constants.RSA_PKCS1_OAEP_PADDING,
      },
      Buffer.from(record.encrypted_secret, "base64"),
    ).toString("utf8")).toBe(wallet.secret());
  });

  it("rejects weak or invalid encryption keys without exposing their values", () => {
    const weakKey = rsaKeyPair(2_048).publicKey;
    const store: TestnetSimulatorAccountStore = { create: vi.fn() };

    expect(() => new RsaEncryptedTestnetSimulatorAccountVault(weakKey, store)).toThrow(
      "at least 3072 bits",
    );
    expect(() => new RsaEncryptedTestnetSimulatorAccountVault("not-a-key", store))
      .toThrow("must be a valid PEM public key");
    expect(() => new RsaEncryptedTestnetSimulatorAccountVault("", store))
      .toThrow("is required");
  });

  it("sanitizes persistence failures so credential material cannot reach monitoring", async () => {
    const keys = rsaKeyPair();
    const wallet = Keypair.random();
    const store: TestnetSimulatorAccountStore = {
      create: vi.fn().mockRejectedValue(new Error(`failed ${wallet.secret()}`)),
    };
    const vault = new RsaEncryptedTestnetSimulatorAccountVault(keys.publicKey, store);

    const failure = await vault.persist(wallet).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "The encrypted Testnet simulator account could not be persisted.",
    );
    expect(JSON.stringify(failure)).not.toContain(wallet.secret());
  });
});

describe("FirestoreTestnetSimulatorAccountStore", () => {
  it("creates a write-once document keyed by the public address", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn(() => ({ create }));
    const collection = vi.fn(() => ({ doc }));
    const store = new FirestoreTestnetSimulatorAccountStore({
      collection,
    } as unknown as Firestore);
    const wallet = Keypair.random();
    const record: TestnetSimulatorAccountRecord = {
      public_key: wallet.publicKey(),
      encrypted_secret: Buffer.alloc(384).toString("base64"),
      created_at: "2026-08-17T00:00:00.000Z",
    };

    await store.create(record);

    expect(collection).toHaveBeenCalledWith("testnet_simulator_accounts");
    expect(doc).toHaveBeenCalledWith(wallet.publicKey());
    expect(create).toHaveBeenCalledWith(record);
  });
});
