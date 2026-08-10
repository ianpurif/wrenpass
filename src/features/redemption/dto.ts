import { z } from "zod";

export const createRedemptionRequestSchema = z.object({
  qrPayload: z.string().min(1).max(512),
  serializedTransaction: z.string().min(1).max(16_384),
  expiresAtLedger: z.number().int().positive(),
});

export const completeRedemptionRequestSchema = z.object({
  requestId: z.string().regex(/^[1-9]\d{0,19}$/),
  transactionHash: z.string().regex(/^[0-9a-f]{64}$/i),
});

export const submitRedemptionRequestSchema = createRedemptionRequestSchema.extend({
  signedAuthorizationEntry: z.string().min(1).max(200_000),
});

export interface RedemptionRequestPreparationDto {
  authorizationEntry: string;
  expiresAtLedger: number;
}

export interface RedemptionScanDto {
  passId: string;
  campaignId: string;
  merchant: string;
  owner: string;
  expiresAt: string;
}

export interface RedemptionRequestDto extends RedemptionScanDto {
  id: string;
  serializedTransaction: string;
  expiresAtLedger: number;
  createdAt: string;
}
