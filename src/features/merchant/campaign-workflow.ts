import type { ClientOptions } from "@stellar/stellar-sdk/contract";
import { z } from "zod";

import type { CampaignTerms } from "@/generated/wrenpass-contract/src";
import type { CampaignContractWriter } from "@/lib/stellar/wrenpass-client";
import type { CampaignMetadataInput } from "@/server/merchant/merchant-service";

type SignTransaction = NonNullable<ClientOptions["signTransaction"]>;

export const recoverableCampaignDraftSchema = z
  .object({
    campaignId: z.string().regex(/^[1-9]\d{0,19}$/),
    name: z.string().trim().min(3).max(140),
    serviceDescription: z.string().trim().min(20).max(4_000),
    imageUrl: z.url().optional(),
    imagePublicId: z.string().trim().min(1).max(240).optional(),
    imageSha256: z.string().regex(/^[a-f\d]{64}$/i).optional(),
  })
  .refine((value) => Boolean(value.imageUrl) === Boolean(value.imagePublicId))
  .refine((value) => !value.imageSha256 || Boolean(value.imageUrl));

export type RecoverableCampaignDraft = z.infer<typeof recoverableCampaignDraftSchema>;

interface WorkflowDependencies {
  writer: CampaignContractWriter;
  saveMetadata(input: CampaignMetadataInput): Promise<unknown>;
  onPending(draft: RecoverableCampaignDraft): void;
  onComplete(): void;
}

interface WalletContext {
  merchant: string;
  signTransaction: SignTransaction;
}

export async function createAndPublishCampaign(
  input: {
    terms: CampaignTerms;
    metadata: Omit<CampaignMetadataInput, "campaignId">;
  } & WalletContext,
  dependencies: WorkflowDependencies,
): Promise<string> {
  const campaignId = await dependencies.writer.createDraft({
    merchant: input.merchant,
    terms: input.terms,
    signTransaction: input.signTransaction,
  });
  const draft = { ...input.metadata, campaignId: campaignId.toString() };
  dependencies.onPending(draft);
  await resumeCampaignPublishing(draft, input, dependencies);
  return draft.campaignId;
}

export async function resumeCampaignPublishing(
  draft: RecoverableCampaignDraft,
  wallet: WalletContext,
  dependencies: WorkflowDependencies,
): Promise<void> {
  await dependencies.saveMetadata(draft);
  await dependencies.writer.publish({
    campaignId: BigInt(draft.campaignId),
    merchant: wallet.merchant,
    signTransaction: wallet.signTransaction,
  });
  dependencies.onComplete();
}
