import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

import { closeFirebaseApp, getFirestoreDb } from "@/server/firestore/firebase-admin";
import {
  notificationSchema,
  userProfileSchema,
  type Notification,
  type UserProfile,
} from "@/server/models";

const USER_PROFILES = "user_profiles";
const NOTIFICATIONS = "notifications";

const legacyNotificationSchema = notificationSchema
  .omit({ recipientWalletAddress: true })
  .extend({ recipientEmail: z.email() });

function walletFromNotificationId(id: string): string {
  const separator = id.lastIndexOf(":");
  const walletAddress = separator < 0 ? "" : id.slice(separator + 1);
  if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
    throw new Error(`Notification ${id} has no valid recipient wallet key.`);
  }
  return walletAddress;
}

function minimizeProfile(documentId: string, value: unknown): {
  profile: UserProfile;
  removedWalletAddress: boolean;
  removedDisplayName: boolean;
} {
  const raw = z.record(z.string(), z.unknown()).parse(value);
  const profile = userProfileSchema.parse(raw);
  if (documentId !== profile.id || !StrKey.isValidEd25519PublicKey(profile.id)) {
    throw new Error(`User profile ${documentId} has an invalid wallet document key.`);
  }
  if (
    typeof raw.walletAddress === "string" &&
    raw.walletAddress !== profile.id
  ) {
    throw new Error(`User profile ${documentId} has a mismatched wallet address.`);
  }
  return {
    profile,
    removedWalletAddress: "walletAddress" in raw,
    removedDisplayName: "displayName" in raw,
  };
}

function minimizeNotification(documentId: string, value: unknown): {
  notification: Notification;
  removedEmail: boolean;
} {
  const current = notificationSchema.safeParse(value);
  if (current.success) {
    if (current.data.id !== documentId) {
      throw new Error(`Notification ${documentId} has a mismatched ID.`);
    }
    if (current.data.recipientWalletAddress !== walletFromNotificationId(documentId)) {
      throw new Error(`Notification ${documentId} has a mismatched recipient wallet.`);
    }
    return { notification: current.data, removedEmail: false };
  }

  const legacy = legacyNotificationSchema.parse(value);
  if (legacy.id !== documentId) {
    throw new Error(`Notification ${documentId} has a mismatched ID.`);
  }
  const retained = notificationSchema
    .omit({ recipientWalletAddress: true })
    .parse(legacy);
  return {
    notification: notificationSchema.parse({
      ...retained,
      recipientWalletAddress: walletFromNotificationId(documentId),
    }),
    removedEmail: true,
  };
}

async function run(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const db = getFirestoreDb();

  try {
    const [profileSnapshot, notificationSnapshot] = await Promise.all([
      db.collection(USER_PROFILES).get(),
      db.collection(NOTIFICATIONS).get(),
    ]);
    const profiles = profileSnapshot.docs.map((document) => ({
      reference: document.ref,
      ...minimizeProfile(document.id, document.data()),
    }));
    const notifications = notificationSnapshot.docs.map((document) => ({
      reference: document.ref,
      ...minimizeNotification(document.id, document.data()),
    }));
    const duplicateWalletFields = profiles.filter(
      (item) => item.removedWalletAddress,
    ).length;
    const unusedDisplayNames = profiles.filter(
      (item) => item.removedDisplayName,
    ).length;
    const duplicatedEmails = notifications.filter((item) => item.removedEmail).length;

    console.log(
      `Verified ${profiles.length} notification profiles and ${notifications.length} delivery records. Found ${duplicateWalletFields} duplicate wallet fields, ${unusedDisplayNames} unused display names, and ${duplicatedEmails} duplicated recipient emails.`,
    );
    if (!apply) {
      console.log("Dry run complete. Use --apply to write the minimized records.");
      return;
    }

    for (const { reference, profile } of profiles) {
      await reference.set(profile);
    }
    for (const { reference, notification } of notifications) {
      await reference.set(notification);
    }

    const [storedProfiles, storedNotifications] = await Promise.all([
      db.collection(USER_PROFILES).get(),
      db.collection(NOTIFICATIONS).get(),
    ]);
    for (const document of storedProfiles.docs) {
      const raw = z.record(z.string(), z.unknown()).parse(document.data());
      userProfileSchema.parse(raw);
      if ("walletAddress" in raw || "displayName" in raw) {
        throw new Error(`User profile ${document.id} was not minimized.`);
      }
    }
    for (const document of storedNotifications.docs) {
      const raw = z.record(z.string(), z.unknown()).parse(document.data());
      notificationSchema.parse(raw);
      if ("recipientEmail" in raw) {
        throw new Error(`Notification ${document.id} still duplicates an email address.`);
      }
    }
    console.log(
      `Minimized and verified ${profiles.length} notification profiles and ${notifications.length} delivery records.`,
    );
  } finally {
    await closeFirebaseApp();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "PII minimization failed.");
  process.exitCode = 1;
});
