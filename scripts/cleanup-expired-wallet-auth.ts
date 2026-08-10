import { z } from "zod";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

import { closeFirebaseApp, getFirestoreDb } from "@/server/firestore/firebase-admin";

const authRecordSchema = z.object({ expiresAt: z.string().datetime() });
const collections = ["walletAuthChallenges", "walletAuthSessions"] as const;

async function run(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const db = getFirestoreDb();
  const now = Date.now();

  try {
    const expired = new Map<string, QueryDocumentSnapshot[]>();
    for (const collection of collections) {
      const snapshot = await db.collection(collection).get();
      expired.set(
        collection,
        snapshot.docs.filter((document) =>
          new Date(authRecordSchema.parse(document.data()).expiresAt).getTime() <= now),
      );
    }
    const counts = Object.fromEntries(
      collections.map((collection) => [collection, expired.get(collection)!.length]),
    );
    console.log(`Expired wallet-auth records: ${JSON.stringify(counts)}.`);
    if (!apply) {
      console.log("Dry run complete. Use --apply to remove only expired records.");
      return;
    }

    for (const collection of collections) {
      for (const document of expired.get(collection)!) {
        await document.ref.delete();
      }
    }
    for (const collection of collections) {
      const snapshot = await db.collection(collection).get();
      const remainingExpired = snapshot.docs.filter((document) =>
        new Date(authRecordSchema.parse(document.data()).expiresAt).getTime() <= now);
      if (remainingExpired.length > 0) {
        throw new Error(`${collection} still contains expired records.`);
      }
    }
    console.log("Expired wallet-auth records removed and verified.");
  } finally {
    await closeFirebaseApp();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Wallet-auth cleanup failed.");
  process.exitCode = 1;
});
