import { z } from "zod";

import type { CampaignTransactionPageDto } from "@/features/campaign-transactions/dto";

const transactionSchema = z.object({
  id: z.string().min(1),
  transactionHash: z.string().regex(/^[a-f\d]{64}$/i),
  passId: z.string().regex(/^[1-9]\d*$/),
  total: z.string().regex(/^\d+$/),
  ledger: z.number().int().positive(),
});

const transactionPageSchema = z.object({
  transactions: z.array(transactionSchema),
  nextCursor: z.string().min(1).nullable(),
  hasMore: z.boolean(),
});

export const campaignTransactionsApi = {
  async list(input: {
    campaignId: string;
    cursor?: string;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<CampaignTransactionPageDto> {
    const query = new URLSearchParams();
    if (input.cursor) query.set("cursor", input.cursor);
    if (input.limit) query.set("limit", String(input.limit));

    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(input.campaignId)}/transactions?${query}`,
      { cache: "no-store", signal: input.signal },
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = z.object({ error: z.string() }).safeParse(body);
      throw new Error(
        message.success
          ? message.data.error
          : "Campaign transactions are temporarily unavailable.",
      );
    }
    return transactionPageSchema.parse(body);
  },
};
