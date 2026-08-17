import "server-only";

import {
  constants,
  createPublicKey,
  publicEncrypt,
  type KeyObject,
} from "node:crypto";

import { StrKey, type Keypair } from "@stellar/stellar-sdk";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { getFirestoreDb } from "@/server/firestore/firebase-admin";
import { TestnetSimulatorConfigurationError } from "@/server/simulator/config";

export const TESTNET_CUSTOMER_WALLETS_COLLECTION = "testnet_customer_wallets";
const MINIMUM_RSA_BITS = 3_072;

export const testnetCustomerWalletRecordSchema = z.object({
  public_key: z.string().refine(
    StrKey.isValidEd25519PublicKey,
    "must be a valid Stellar account",
  ),
  encrypted_secret: z
    .string()
    .min(256)
    .max(2_048)
    .regex(/^[A-Za-z\d+/]+={0,2}$/, "must be base64-encoded ciphertext"),
  created_at: z.iso.datetime(),
});

export type TestnetCustomerWalletRecord = z.infer<
  typeof testnetCustomerWalletRecordSchema
>;

export interface TestnetCustomerWalletStore {
  create(record: TestnetCustomerWalletRecord): Promise<void>;
}

export interface TestnetCustomerWalletVault {
  persist(wallet: Keypair): Promise<void>;
}

export class FirestoreTestnetCustomerWalletStore
implements TestnetCustomerWalletStore {
  constructor(private readonly db: Firestore = getFirestoreDb()) {}

  async create(record: TestnetCustomerWalletRecord): Promise<void> {
    const validated = testnetCustomerWalletRecordSchema.parse(record);
    await this.db
      .collection(TESTNET_CUSTOMER_WALLETS_COLLECTION)
      .doc(validated.public_key)
      .create(validated);
  }
}

function parseEncryptionKey(value: string | undefined): KeyObject {
  if (!value?.trim()) {
    throw new TestnetSimulatorConfigurationError(
      "TESTNET_SIMULATOR_EXPORT_PUBLIC_KEY is required.",
    );
  }

  let key: KeyObject;
  try {
    key = createPublicKey(value.replace(/\\n/g, "\n"));
  } catch {
    throw new TestnetSimulatorConfigurationError(
      "TESTNET_SIMULATOR_EXPORT_PUBLIC_KEY must be a valid PEM public key.",
    );
  }

  if (
    key.asymmetricKeyType !== "rsa"
    || (key.asymmetricKeyDetails?.modulusLength ?? 0) < MINIMUM_RSA_BITS
  ) {
    throw new TestnetSimulatorConfigurationError(
      `TESTNET_SIMULATOR_EXPORT_PUBLIC_KEY must be an RSA key of at least ${MINIMUM_RSA_BITS} bits.`,
    );
  }
  return key;
}

export class RsaEncryptedTestnetCustomerWalletVault
implements TestnetCustomerWalletVault {
  private readonly encryptionKey: KeyObject;

  constructor(
    publicKey: string,
    private readonly store: TestnetCustomerWalletStore,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.encryptionKey = parseEncryptionKey(publicKey);
  }

  async persist(wallet: Keypair): Promise<void> {
    try {
      const encryptedSecret = publicEncrypt(
        {
          key: this.encryptionKey,
          oaepHash: "sha256",
          padding: constants.RSA_PKCS1_OAEP_PADDING,
        },
        Buffer.from(wallet.secret(), "utf8"),
      ).toString("base64");

      await this.store.create({
        public_key: wallet.publicKey(),
        encrypted_secret: encryptedSecret,
        created_at: this.now().toISOString(),
      });
    } catch {
      throw new Error("The encrypted Testnet customer wallet could not be persisted.");
    }
  }
}

export function createTestnetCustomerWalletVault(
  publicKey = process.env.TESTNET_SIMULATOR_EXPORT_PUBLIC_KEY,
): TestnetCustomerWalletVault {
  return new RsaEncryptedTestnetCustomerWalletVault(
    publicKey ?? "",
    new FirestoreTestnetCustomerWalletStore(),
  );
}
