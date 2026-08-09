import "server-only";

import { z } from "zod";

const requiredValue = z.string().trim().min(1, "is required");

const serverEnvSchema = z.object({
  FIREBASE_PROJECT_ID: requiredValue,
  FIREBASE_CLIENT_EMAIL: z.email("must be a valid email address"),
  FIREBASE_PRIVATE_KEY: requiredValue
    .transform((value) => value.replace(/\\n/g, "\n"))
    .refine(
      (value) =>
        value.includes("-----BEGIN PRIVATE KEY-----") &&
        value.includes("-----END PRIVATE KEY-----"),
      "must be a PEM private key",
    ),
  CLOUDINARY_CLOUD_NAME: requiredValue,
  CLOUDINARY_API_KEY: requiredValue,
  CLOUDINARY_API_SECRET: requiredValue,
  GMAIL_SMTP_USER: z.email("must be a valid email address"),
  GMAIL_SMTP_APP_PASSWORD: requiredValue
    .transform((value) => value.replace(/\s/g, ""))
    .pipe(z.string().min(16, "must be a Gmail App Password")),
  EMAIL_FROM: requiredValue
    .max(160, "must be 160 characters or fewer")
    .refine((value) => !/[\r\n]/.test(value), "must not contain line breaks"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function parseServerEnv(input: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(input);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid server environment configuration: ${problems}`);
  }

  return result.data;
}

export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env);
  return cachedEnv;
}
