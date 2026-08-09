import { randomUUID } from "node:crypto";

import { createCloudinaryImageService } from "@/server/cloudinary/image-service";
import { buildNotificationEmail, createEmailService } from "@/server/email/email-service";
import { getServerEnv } from "@/server/env";
import { closeFirebaseApp } from "@/server/firestore/firebase-admin";
import { FirestoreDocumentStore } from "@/server/firestore/document-store";
import { createOffchainRepositories } from "@/server/firestore/repositories";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=";

async function smokeTestFirestore(): Promise<void> {
  const repository = createOffchainRepositories(new FirestoreDocumentStore()).userProfiles;
  const documentId = `phase2-smoke-${randomUUID()}`;
  let created = false;

  try {
    const now = new Date().toISOString();
    await repository.save({
      id: documentId,
      walletAddress: "GPHASE2SMOKETEST",
      displayName: "Phase 2 smoke test",
      createdAt: now,
      updatedAt: now,
    });
    created = true;

    const stored = await repository.findById(documentId);
    if (stored?.id !== documentId) {
      throw new Error("Firestore read did not return the created document");
    }
  } finally {
    if (created) {
      await repository.deleteById(documentId);
    }
  }
}

async function smokeTestCloudinary(): Promise<void> {
  const service = createCloudinaryImageService();
  let publicId: string | undefined;

  try {
    const uploaded = await service.uploadImage({
      source: new Blob([Buffer.from(ONE_PIXEL_PNG, "base64")], { type: "image/png" }),
      folder: "wrenpass/smoke-tests",
      publicId: `phase2-${randomUUID()}`,
    });
    publicId = uploaded.publicId;

    if (!uploaded.secureUrl.startsWith("https://")) {
      throw new Error("Cloudinary did not return a secure URL");
    }
  } finally {
    if (publicId) {
      await service.deleteImage(publicId);
    }
  }
}

async function smokeTestEmail(): Promise<void> {
  const env = getServerEnv();
  const service = createEmailService();
  await service.verifyConnection();
  await service.send(
    buildNotificationEmail({
      to: env.GMAIL_SMTP_USER,
      subject: "WrenPass Phase 2 service check",
      heading: "Email service connected",
      body: "This one-time message confirms that the configured Gmail SMTP adapter can send WrenPass notifications.",
    }),
  );
}

async function run(): Promise<void> {
  const requestedChecks = new Set(process.argv.slice(2));
  const shouldRun = (name: string) => requestedChecks.size === 0 || requestedChecks.has(name);

  try {
    if (shouldRun("firestore")) {
      await smokeTestFirestore();
      console.log("Firestore smoke test: passed");
    }

    if (shouldRun("cloudinary")) {
      await smokeTestCloudinary();
      console.log("Cloudinary smoke test: passed and temporary image removed");
    }

    if (shouldRun("email")) {
      await smokeTestEmail();
      console.log("Gmail SMTP smoke test: passed");
    }
  } finally {
    await closeFirebaseApp();
  }
}

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const providerError = error as Record<string, unknown>;
    if (typeof providerError.message === "string") {
      return providerError.message;
    }

    if (typeof providerError.error === "object" && providerError.error !== null) {
      const nestedError = providerError.error as Record<string, unknown>;
      if (typeof nestedError.message === "string") {
        return nestedError.message;
      }
    }
  }

  return "Provider returned an unrecognized error";
}

run().catch((error: unknown) => {
  console.error(`Service smoke test failed: ${getSafeErrorMessage(error)}`);
  process.exitCode = 1;
});
