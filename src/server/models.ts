import { z } from "zod";

export const entityIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !value.includes("/"), "must not contain path separators");
const isoTimestamp = z.string().datetime();
const walletAddress = z.string().trim().min(1).max(128);
const optionalUrl = z.url().optional();
export const sha256Schema = z.string().regex(/^[a-f\d]{64}$/i);
export const cloudinaryPublicIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .regex(/^[a-zA-Z0-9/_-]+$/)
  .refine((value) => !value.includes("..") && !value.startsWith("/"));

export const userProfileSchema = z.object({
  id: entityIdSchema,
  email: z.email().optional(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const merchantSchema = z.object({
  id: entityIdSchema,
  ownerWalletAddress: walletAddress,
  businessName: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1).max(2_000),
  logoUrl: optionalUrl,
  logoSha256: sha256Schema.optional(),
  logoPublicId: cloudinaryPublicIdSchema.optional(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const campaignMetadataSchema = z.object({
  id: entityIdSchema,
  contractId: entityIdSchema,
  merchantId: entityIdSchema,
  name: z.string().trim().min(1).max(140),
  serviceDescription: z.string().trim().min(1).max(4_000),
  imageUrl: optionalUrl,
  imageSha256: sha256Schema.optional(),
  imagePublicId: cloudinaryPublicIdSchema.optional(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const cloudinaryAssetReferenceSchema = z.object({
  id: entityIdSchema,
  kind: z.enum(["merchant_logo", "campaign_image"]),
  ownerWalletAddress: walletAddress,
  resourceId: entityIdSchema,
  publicUrl: z
    .url()
    .refine((value) => new URL(value).hostname === "res.cloudinary.com"),
  publicId: cloudinaryPublicIdSchema,
  sha256: sha256Schema.optional(),
  updatedAt: isoTimestamp,
});

export const notificationTypeSchema = z.enum([
  "pass_purchased",
  "pass_gifted",
  "pass_received",
  "pass_redeemed",
  "pass_nearing_expiration",
  "refund_processed",
  "campaign_sold_out",
]);

export const notificationSchema = z.object({
  id: entityIdSchema,
  recipientWalletAddress: walletAddress,
  type: notificationTypeSchema,
  status: z.enum(["pending", "sent", "failed"]),
  relatedEntityId: entityIdSchema.optional(),
  failureReason: z.string().trim().max(500).optional(),
  claimExpiresAt: isoTimestamp.optional(),
  createdAt: isoTimestamp,
  sentAt: isoTimestamp.optional(),
});

export const indexedBlockchainEventSchema = z.object({
  id: entityIdSchema,
  contractId: entityIdSchema,
  transactionHash: entityIdSchema,
  campaignEventKey: z.string().trim().min(1).max(256).optional(),
  eventIndex: z.number().int().nonnegative(),
  ledger: z.number().int().nonnegative(),
  eventType: z.string().trim().min(1).max(120),
  payload: z.record(z.string(), z.unknown()),
  indexedAt: isoTimestamp,
});

export const eventSyncCursorSchema = z.object({
  id: entityIdSchema,
  kind: z.literal("event_sync_cursor"),
  nextLedger: z.number().int().positive(),
  updatedAt: isoTimestamp,
});

export const operationLeaseSchema = z.object({
  id: entityIdSchema,
  kind: z.literal("operation_lease"),
  ownerId: entityIdSchema,
  expiresAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const rateLimitWindowSchema = z.object({
  id: entityIdSchema,
  kind: z.literal("rate_limit_window"),
  count: z.number().int().positive(),
  windowStartedAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const operationalStateSchema = z.discriminatedUnion("kind", [
  eventSyncCursorSchema,
  operationLeaseSchema,
  rateLimitWindowSchema,
]);

export type UserProfile = z.infer<typeof userProfileSchema>;
export type Merchant = z.infer<typeof merchantSchema>;
export type CampaignMetadata = z.infer<typeof campaignMetadataSchema>;
export type CloudinaryAssetReference = z.infer<typeof cloudinaryAssetReferenceSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type IndexedBlockchainEvent = z.infer<typeof indexedBlockchainEventSchema>;
export type EventSyncCursor = z.infer<typeof eventSyncCursorSchema>;
export type OperationLease = z.infer<typeof operationLeaseSchema>;
export type RateLimitWindow = z.infer<typeof rateLimitWindowSchema>;
export type OperationalState = z.infer<typeof operationalStateSchema>;
