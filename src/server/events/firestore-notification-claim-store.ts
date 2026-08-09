import "server-only";

import type { Firestore } from "firebase-admin/firestore";

import type { NotificationClaimStore } from "@/server/events/event-sync-service";
import { getFirestoreDb } from "@/server/firestore/firebase-admin";
import { notificationSchema, type Notification } from "@/server/models";

const NOTIFICATIONS = "notifications";

export class FirestoreNotificationClaimStore implements NotificationClaimStore {
  constructor(private readonly db: Firestore = getFirestoreDb()) {}

  async claim(
    notification: Notification,
    now: Date,
    claimExpiresAt: Date,
  ): Promise<boolean> {
    const candidate = notificationSchema.parse(notification);
    const reference = this.db.collection(NOTIFICATIONS).doc(candidate.id);

    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const existing = snapshot.exists ? notificationSchema.parse(snapshot.data()) : null;
      if (existing?.status === "sent") return false;
      if (
        existing?.claimExpiresAt &&
        new Date(existing.claimExpiresAt).getTime() > now.getTime()
      ) {
        return false;
      }

      transaction.set(reference, {
        ...candidate,
        createdAt: existing?.createdAt ?? candidate.createdAt,
        claimExpiresAt: claimExpiresAt.toISOString(),
      });
      return true;
    });
  }
}
