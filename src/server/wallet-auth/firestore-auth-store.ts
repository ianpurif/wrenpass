import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { getFirestoreDb } from "@/server/firestore/firebase-admin";
import type {
  WalletAuthChallenge,
  WalletAuthSession,
  WalletAuthStore,
} from "@/server/wallet-auth/auth-service";

const CHALLENGES = "walletAuthChallenges";
const SESSIONS = "walletAuthSessions";
const CLEANUP_LIMIT = 100;

const challengeSchema = z.object({
  idHash: z.string().length(64),
  address: z.string().min(1),
  message: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

const sessionSchema = z.object({
  tokenHash: z.string().length(64),
  address: z.string().min(1),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export class FirestoreWalletAuthStore implements WalletAuthStore {
  constructor(private readonly db: Firestore = getFirestoreDb()) {}

  private async removeExpired(collection: string): Promise<void> {
    const snapshot = await this.db
      .collection(collection)
      .where("expiresAt", "<=", new Date().toISOString())
      .limit(CLEANUP_LIMIT)
      .get();
    if (snapshot.empty) return;

    const batch = this.db.batch();
    for (const document of snapshot.docs) batch.delete(document.ref);
    await batch.commit();
  }

  private async cleanupExpired(collection: string): Promise<void> {
    await this.removeExpired(collection).catch((error: unknown) => {
      console.warn(`Unable to clean expired ${collection} records.`, error);
    });
  }

  async saveChallenge(challenge: WalletAuthChallenge): Promise<void> {
    await this.db.collection(CHALLENGES).doc(challenge.idHash).set(challenge);
    await this.cleanupExpired(CHALLENGES);
  }

  async readChallenge(idHash: string): Promise<WalletAuthChallenge | null> {
    const snapshot = await this.db.collection(CHALLENGES).doc(idHash).get();
    return snapshot.exists ? challengeSchema.parse(snapshot.data()) : null;
  }

  async consumeChallenge(idHash: string): Promise<WalletAuthChallenge | null> {
    const reference = this.db.collection(CHALLENGES).doc(idHash);

    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return null;

      const challenge = challengeSchema.parse(snapshot.data());
      transaction.delete(reference);
      return challenge;
    });
  }

  async saveSession(session: WalletAuthSession): Promise<void> {
    await this.db.collection(SESSIONS).doc(session.tokenHash).set(session);
    await this.cleanupExpired(SESSIONS);
  }

  async readSession(tokenHash: string): Promise<WalletAuthSession | null> {
    const snapshot = await this.db.collection(SESSIONS).doc(tokenHash).get();
    return snapshot.exists ? sessionSchema.parse(snapshot.data()) : null;
  }

  async removeSession(tokenHash: string): Promise<void> {
    await this.db.collection(SESSIONS).doc(tokenHash).delete();
  }
}
