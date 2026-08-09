import "server-only";

import { cert, deleteApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { getServerEnv } from "@/server/env";

const APP_NAME = "wrenpass-server";

export function getFirebaseApp(): App {
  const existingApp = getApps().find((app) => app.name === APP_NAME);

  if (existingApp) {
    return existingApp;
  }

  const env = getServerEnv();

  return initializeApp(
    {
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY,
      }),
      projectId: env.FIREBASE_PROJECT_ID,
    },
    APP_NAME,
  );
}
export function getFirestoreDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

export async function closeFirebaseApp(): Promise<void> {
  const app = getApps().find((candidate) => candidate.name === APP_NAME);

  if (app) {
    await deleteApp(app);
  }
}
