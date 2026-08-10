import { z } from "zod";

import type {
  RedemptionRequestDto,
  RedemptionScanDto,
} from "@/features/redemption/dto";

const scanSchema = z.object({
  passId: z.string(),
  campaignId: z.string(),
  merchant: z.string(),
  owner: z.string(),
  expiresAt: z.string(),
});
const requestSchema = scanSchema.extend({
  id: z.string(),
  serializedTransaction: z.string(),
  expiresAtLedger: z.number(),
  createdAt: z.string(),
});
const preparationSchema = z.object({
  authorizationEntry: z.string().min(1),
  expiresAtLedger: z.number().int().positive(),
});

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = (await response.json()) as { error?: unknown };
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "The redemption request failed.");
  }
  return data;
}

export const redemptionApi = {
  async validate(qrPayload: string): Promise<RedemptionScanDto> {
    return scanSchema.parse(
      await requestJson("/api/redemptions/validate", {
        method: "POST",
        body: JSON.stringify({ qrPayload }),
      }),
    );
  },

  async prepareCreate(input: {
    qrPayload: string;
    serializedTransaction: string;
    expiresAtLedger: number;
  }) {
    return preparationSchema.parse(
      await requestJson("/api/redemptions", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  },

  async submitCreate(input: {
    qrPayload: string;
    serializedTransaction: string;
    expiresAtLedger: number;
    signedAuthorizationEntry: string;
  }): Promise<RedemptionRequestDto> {
    return requestSchema.parse(
      await requestJson("/api/redemptions", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    );
  },

  async getPending(): Promise<RedemptionRequestDto[]> {
    return z.array(requestSchema).parse(await requestJson("/api/redemptions"));
  },

  async complete(requestId: string, transactionHash: string): Promise<void> {
    await requestJson("/api/redemptions", {
      method: "PATCH",
      body: JSON.stringify({ requestId, transactionHash }),
    });
  },
};
