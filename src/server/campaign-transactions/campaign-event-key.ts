import { z } from "zod";

import { entityIdSchema } from "@/server/models";

export const campaignIdSchema = z.string().regex(/^[1-9]\d*$/);

export class InvalidCampaignTransactionCursorError extends Error {
  constructor() {
    super("The campaign transaction cursor is invalid.");
    this.name = "InvalidCampaignTransactionCursorError";
  }
}

export function campaignEventKey(campaignId: string, eventId: string): string {
  return `${campaignIdSchema.parse(campaignId)}:${entityIdSchema.parse(eventId)}`;
}

export function campaignEventPrefix(campaignId: string): string {
  return `${campaignIdSchema.parse(campaignId)}:`;
}

export function encodeCampaignTransactionCursor(key: string): string {
  return Buffer.from(key, "utf8").toString("base64url");
}

export function decodeCampaignTransactionCursor(
  campaignId: string,
  cursor: string,
): string {
  try {
    const parsed = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).parse(cursor);
    const key = Buffer.from(parsed, "base64url").toString("utf8");
    const prefix = campaignEventPrefix(campaignId);
    if (!key.startsWith(prefix)) throw new InvalidCampaignTransactionCursorError();
    campaignEventKey(campaignId, key.slice(prefix.length));
    return key;
  } catch (error) {
    if (error instanceof InvalidCampaignTransactionCursorError) throw error;
    throw new InvalidCampaignTransactionCursorError();
  }
}
