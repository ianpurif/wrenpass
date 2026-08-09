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

export const userProfileSchema = z.object({
  id: entityIdSchema,
  walletAddress,
  displayName: z.string().trim().min(1).max(120).optional(),
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
  createdAt: isoTimestamp,
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
  recipientEmail: z.email(),
  type: notificationTypeSchema,
  status: z.enum(["pending", "sent", "failed"]),
  relatedEntityId: entityIdSchema.optional(),
  failureReason: z.string().trim().max(500).optional(),
  createdAt: isoTimestamp,
  sentAt: isoTimestamp.optional(),
});

export const indexedBlockchainEventSchema = z.object({
  id: entityIdSchema,
  contractId: entityIdSchema,
  transactionHash: entityIdSchema,
  eventIndex: z.number().int().nonnegative(),
  ledger: z.number().int().nonnegative(),
  eventType: z.string().trim().min(1).max(120),
  payload: z.record(z.string(), z.unknown()),
  indexedAt: isoTimestamp,
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type Merchant = z.infer<typeof merchantSchema>;
export type CampaignMetadata = z.infer<typeof campaignMetadataSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type IndexedBlockchainEvent = z.infer<typeof indexedBlockchainEventSchema>;
