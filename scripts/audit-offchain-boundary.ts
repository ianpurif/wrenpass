import { StrKey } from "@stellar/stellar-sdk";
import { z, type ZodType } from "zod";

import { closeFirebaseApp, getFirestoreDb } from "@/server/firestore/firebase-admin";
import {
  cloudinaryAssetReferenceSchema,
  indexedBlockchainEventSchema,
  notificationSchema,
  userProfileSchema,
} from "@/server/models";

const legacyCollections = [
  "campaign_metadata",
  "merchants",
  "metadata_registry_entries",
  "redemption_requests",
  "review_receipts",
] as const;

const walletAddressSchema = z
  .string()
  .refine(StrKey.isValidEd25519PublicKey, "must be a valid Stellar account");
const hashSchema = z.string().regex(/^[a-f\d]{64}$/i);
const challengeSchema = z.object({
  idHash: hashSchema,
  address: walletAddressSchema,
  message: z.string().min(1),
  expiresAt: z.string().datetime(),
});
const sessionSchema = z.object({
  tokenHash: hashSchema,
  address: walletAddressSchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

const retainedCollections = {
  user_profiles: userProfileSchema,
  cloudinary_asset_references: cloudinaryAssetReferenceSchema,
  notifications: notificationSchema,
  indexed_blockchain_events: indexedBlockchainEventSchema,
  walletAuthChallenges: challengeSchema,
  walletAuthSessions: sessionSchema,
} satisfies Record<string, ZodType>;

const retainedCollectionFields: Record<string, Set<string>> = {
  user_profiles: new Set(["id", "email", "createdAt", "updatedAt"]),
  cloudinary_asset_references: new Set([
    "id",
    "kind",
    "ownerWalletAddress",
    "resourceId",
    "publicUrl",
    "publicId",
    "sha256",
    "updatedAt",
  ]),
  notifications: new Set([
    "id",
    "recipientWalletAddress",
    "type",
    "status",
    "relatedEntityId",
    "failureReason",
    "claimExpiresAt",
    "createdAt",
    "sentAt",
  ]),
  indexed_blockchain_events: new Set([
    "id",
    "contractId",
    "transactionHash",
    "eventIndex",
    "ledger",
    "eventType",
    "payload",
    "indexedAt",
  ]),
  walletAuthChallenges: new Set(["idHash", "address", "message", "expiresAt"]),
  walletAuthSessions: new Set([
    "tokenHash",
    "address",
    "createdAt",
    "expiresAt",
  ]),
};

async function validateCollection(
  name: string,
  schema: ZodType,
): Promise<number> {
  const snapshot = await getFirestoreDb().collection(name).get();
  for (const document of snapshot.docs) {
    const raw = document.data();
    const unexpectedFields = Object.keys(raw).filter(
      (field) => !retainedCollectionFields[name].has(field),
    );
    if (unexpectedFields.length > 0) {
      throw new Error(`${name}/${document.id} contains unapproved fields.`);
    }
    const parsed = schema.parse(raw) as Record<string, unknown>;
    const embeddedId = parsed.id ?? parsed.idHash ?? parsed.tokenHash;
    if (embeddedId !== document.id) {
      throw new Error(`${name}/${document.id} has a mismatched document key.`);
    }
  }
  return snapshot.size;
}

async function countExpiredAuthRecords(name: string): Promise<number> {
  const snapshot = await getFirestoreDb().collection(name).get();
  const now = Date.now();
  return snapshot.docs.filter((document) => {
    const data = document.data();
    return typeof data.expiresAt === "string" &&
      new Date(data.expiresAt).getTime() <= now;
  }).length;
}

async function run(): Promise<void> {
  const db = getFirestoreDb();
  try {
    for (const name of legacyCollections) {
      const snapshot = await db.collection(name).limit(1).get();
      if (!snapshot.empty) {
        throw new Error(`Legacy Firestore collection ${name} is not empty.`);
      }
    }

    const configuredCollections = new Set([
      ...legacyCollections,
      ...Object.keys(retainedCollections),
    ]);
    const liveCollections = await db.listCollections();
    const unexpected = liveCollections
      .map((collection) => collection.id)
      .filter((name) => !configuredCollections.has(name));
    if (unexpected.length > 0) {
      throw new Error(`Unexpected Firestore collections: ${unexpected.join(", ")}.`);
    }

    const counts = Object.fromEntries(
      await Promise.all(
        Object.entries(retainedCollections).map(async ([name, schema]) => [
          name,
          await validateCollection(name, schema),
        ]),
      ),
    );
    const expiredAuthRecords = {
      walletAuthChallenges: await countExpiredAuthRecords("walletAuthChallenges"),
      walletAuthSessions: await countExpiredAuthRecords("walletAuthSessions"),
    };
    console.log(
      `Off-chain boundary verified: ${JSON.stringify(counts)}. Expired auth records: ${JSON.stringify(expiredAuthRecords)}. All legacy authoritative collections are empty.`,
    );
  } finally {
    await closeFirebaseApp();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Off-chain boundary audit failed.");
  process.exitCode = 1;
});
