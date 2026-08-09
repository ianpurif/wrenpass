import "server-only";

import type { Firestore } from "firebase-admin/firestore";

import { getFirestoreDb } from "@/server/firestore/firebase-admin";

export interface DocumentStore {
  read(collection: string, id: string): Promise<unknown | null>;
  write(collection: string, id: string, data: Record<string, unknown>): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
}
export class FirestoreDocumentStore implements DocumentStore {
  constructor(private readonly db: Firestore = getFirestoreDb()) {}

  async read(collection: string, id: string): Promise<unknown | null> {
    const snapshot = await this.db.collection(collection).doc(id).get();
    return snapshot.exists ? snapshot.data() ?? null : null;
  }

  async write(
    collection: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.db.collection(collection).doc(id).set(data);
  }

  async remove(collection: string, id: string): Promise<void> {
    await this.db.collection(collection).doc(id).delete();
  }
}
