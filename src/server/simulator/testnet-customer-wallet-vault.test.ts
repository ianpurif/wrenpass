// @vitest-environment node

import {
  constants,
  generateKeyPairSync,
  privateDecrypt,
} from "node:crypto";

import { Keypair } from "@stellar/stellar-sdk";
import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import {
  FirestoreTestnetCustomerWalletStore,
  RsaEncryptedTestnetCustomerWalletVault,
  type TestnetCustomerWalletRecord,
  type TestnetCustomerWalletStore,
} from "@/server/simulator/testnet-customer-wallet-vault";

function rsaKeyPair(modulusLength = 3_072) {
  return generateKeyPairSync("rsa", {
    modulusLength,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

describe("RsaEncryptedTestnetCustomerWalletVault", () => {
  it("stores only the public address, encrypted secret, and timestamp", async () => {
    const keys = rsaKeyPair();
    const create = vi.fn<(record: TestnetCustomerWalletRecord) => Promise<void>>()
      .mockResolvedValue(undefined);
    const store: TestnetCustomerWalletStore = { create };
    const vault = new RsaEncryptedTestnetCustomerWalletVault(
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
    const store: TestnetCustomerWalletStore = { create: vi.fn() };

    expect(() => new RsaEncryptedTestnetCustomerWalletVault(weakKey, store)).toThrow(
      "at least 3072 bits",
    );
    expect(() => new RsaEncryptedTestnetCustomerWalletVault("not-a-key", store))
      .toThrow("must be a valid PEM public key");
    expect(() => new RsaEncryptedTestnetCustomerWalletVault("", store))
      .toThrow("is required");
  });

  it("sanitizes persistence failures so credential material cannot reach monitoring", async () => {
    const keys = rsaKeyPair();
    const wallet = Keypair.random();
    const store: TestnetCustomerWalletStore = {
      create: vi.fn().mockRejectedValue(new Error(`failed ${wallet.secret()}`)),
    };
    const vault = new RsaEncryptedTestnetCustomerWalletVault(keys.publicKey, store);

    const failure = await vault.persist(wallet).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "The encrypted Testnet customer wallet could not be persisted.",
    );
    expect(JSON.stringify(failure)).not.toContain(wallet.secret());
  });
});

describe("FirestoreTestnetCustomerWalletStore", () => {
  it("creates a write-once document keyed by the public address", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn(() => ({ create }));
    const collection = vi.fn(() => ({ doc }));
    const store = new FirestoreTestnetCustomerWalletStore({
      collection,
    } as unknown as Firestore);
    const wallet = Keypair.random();
    const record: TestnetCustomerWalletRecord = {
      public_key: wallet.publicKey(),
      encrypted_secret: Buffer.alloc(384).toString("base64"),
      created_at: "2026-08-17T00:00:00.000Z",
    };

    await store.create(record);

    expect(collection).toHaveBeenCalledWith("testnet_customer_wallets");
    expect(doc).toHaveBeenCalledWith(wallet.publicKey());
    expect(create).toHaveBeenCalledWith(record);
  });
});
