import { z } from "zod";

import type { CampaignMetadataInput, MerchantProfileUpdate } from "@/server/merchant/merchant-service";
import {
  campaignMetadataSchema,
  merchantSchema,
} from "@/server/models";

const integerStringSchema = z.string().regex(/^\d+$/);
export const onchainCampaignSchema = z.object({
  id: integerStringSchema,
  merchant: z.string(),
  passPrice: integerStringSchema,
  serviceValue: integerStringSchema,
  maxSupply: z.number().int().nonnegative(),
  sold: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  redeemed: z.number().int().nonnegative(),
  refunded: z.number().int().nonnegative(),
  merchantReleased: integerStringSchema,
  protectedFunds: integerStringSchema,
  platformFeesPaid: integerStringSchema,
  expiresAt: integerStringSchema,
  financialRules: z.object({
    merchantBps: z.number().int().nonnegative(),
    reserveBps: z.number().int().nonnegative(),
    platformFeeBps: z.number().int().nonnegative(),
  }),
  status: z.enum(["Draft", "Active", "Paused", "Expired", "Cancelled"]),
});
export const merchantCampaignSchema = z.object({
  metadata: campaignMetadataSchema,
  onchain: onchainCampaignSchema,
});
const merchantDashboardSchema = z.object({
  merchant: merchantSchema.nullable(),
  campaigns: z.array(merchantCampaignSchema),
});
const profileResponseSchema = z.object({ merchant: merchantSchema.nullable() });
const savedProfileResponseSchema = z.object({ merchant: merchantSchema });
const savedMetadataResponseSchema = z.object({ metadata: campaignMetadataSchema });
const uploadResponseSchema = z.object({ url: z.url(), publicId: z.string().min(1) });
export const publicCampaignSchema = merchantCampaignSchema.extend({ merchant: merchantSchema });

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, credentials: "same-origin" });
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload.error === "string"
        ? payload.error
        : "The merchant request could not be completed.",
    );
  }
  return payload;
}

export const merchantApi = {
  async getProfile() {
    return profileResponseSchema.parse(await requestJson("/api/merchant/profile")).merchant;
  },
  async saveProfile(input: MerchantProfileUpdate) {
    return savedProfileResponseSchema.parse(
      await requestJson("/api/merchant/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    ).merchant;
  },
  async getDashboard() {
    return merchantDashboardSchema.parse(await requestJson("/api/merchant/campaigns"));
  },
  async saveCampaignMetadata(input: CampaignMetadataInput) {
    return savedMetadataResponseSchema.parse(
      await requestJson("/api/merchant/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    ).metadata;
  },
  async uploadImage(kind: "merchant-logo" | "campaign-image", file: File) {
    const body = new FormData();
    body.set("kind", kind);
    body.set("file", file);
    return uploadResponseSchema.parse(
      await requestJson("/api/merchant/images", { method: "POST", body }),
    );
  },
};
