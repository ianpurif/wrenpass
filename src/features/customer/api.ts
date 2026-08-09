import { z } from "zod";

import { publicCampaignSchema } from "@/features/merchant/api";

const integerStringSchema = z.string().regex(/^\d+$/);
const passStatusSchema = z.enum(["Active", "Redeemed", "Expired", "Refunded"]);
const customerPassSchema = z.object({
  id: integerStringSchema,
  campaignId: integerStringSchema,
  owner: z.string(),
  status: passStatusSchema,
  purchasedAt: integerStringSchema,
  purchaseAmounts: z.object({
    total: integerStringSchema,
    merchantRelease: integerStringSchema,
    protectedReserve: integerStringSchema,
    platformFee: integerStringSchema,
  }),
  campaign: publicCampaignSchema.nullable(),
});
const activitySchema = z.object({
  id: z.string(),
  kind: z.enum(["Purchased", "Gifted", "Received"]),
  campaignId: integerStringSchema,
  passId: integerStringSchema,
  occurredAt: z.string().datetime(),
  transactionHash: z.string().regex(/^[a-f\d]{64}$/),
  amount: integerStringSchema.optional(),
  counterparty: z.string().optional(),
});
const dashboardSchema = z.object({
  passes: z.array(customerPassSchema),
  activity: z.array(activitySchema),
  activityWindowStartsAt: z.string().datetime(),
});

async function requestJson(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: "same-origin" });
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload.error === "string"
        ? payload.error
        : "The customer request could not be completed.",
    );
  }
  return payload;
}

export const customerApi = {
  async getDashboard() {
    return dashboardSchema.parse(await requestJson("/api/customer/passes"));
  },
};
