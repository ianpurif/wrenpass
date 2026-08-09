import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/server/env";

const validEnv = {
  FIREBASE_PROJECT_ID: "wrenpass-test",
  FIREBASE_CLIENT_EMAIL: "firebase-adminsdk@wrenpass-test.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\\nprivate-key-value\\n-----END PRIVATE KEY-----\\n",
  CLOUDINARY_CLOUD_NAME: "wrenpass-cloud",
  CLOUDINARY_API_KEY: "cloudinary-key",
  CLOUDINARY_API_SECRET: "cloudinary-secret",
  GMAIL_SMTP_USER: "wrenpass@example.com",
  GMAIL_SMTP_APP_PASSWORD: "abcd efgh ijkl mnop",
  EMAIL_FROM: "WrenPass <wrenpass@example.com>",
};

describe("parseServerEnv", () => {
  it("normalizes multiline keys and Gmail App Passwords", () => {
    const env = parseServerEnv(validEnv);

    expect(env.FIREBASE_PRIVATE_KEY).toContain("\nprivate-key-value\n");
    expect(env.GMAIL_SMTP_APP_PASSWORD).toBe("abcdefghijklmnop");
  });

  it("reports missing variable names without exposing configured values", () => {
    const { CLOUDINARY_API_SECRET: omittedSecret, ...missingSecret } = validEnv;

    expect(() => parseServerEnv(missingSecret)).toThrow("CLOUDINARY_API_SECRET");
    expect(() => parseServerEnv(missingSecret)).not.toThrow(omittedSecret);
  });
});
