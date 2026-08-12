import type { ClientOptions } from "@stellar/stellar-sdk/contract";

import type { CampaignTerms } from "@/generated/wrenpass-contract/src";
import type { CampaignContractWriter } from "@/lib/stellar/wrenpass-client";
import type { AtomicCampaignPublisher } from "@/lib/stellar/publisher-client";
import type { CampaignMetadataInput } from "@/server/merchant/merchant-service";

type SignTransaction = NonNullable<ClientOptions["signTransaction"]>;

interface WorkflowDependencies {
  writer: CampaignContractWriter;
  saveMetadata(input: CampaignMetadataInput): Promise<unknown>;
  atomicPublisher?: AtomicCampaignPublisher;
  saveMetadataReference?(input: CampaignMetadataInput): Promise<unknown>;
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
  if (dependencies.atomicPublisher && dependencies.saveMetadataReference) {
    const campaignId = await dependencies.atomicPublisher.createAndPublish({
      merchant: input.merchant,
      terms: input.terms,
      metadata: input.metadata,
      signTransaction: input.signTransaction,
    });
    const metadata = { ...input.metadata, campaignId: campaignId.toString() };
    await dependencies.saveMetadataReference(metadata);
    return metadata.campaignId;
  }

  const campaignId = await dependencies.writer.createDraft({
    merchant: input.merchant,
    terms: input.terms,
    signTransaction: input.signTransaction,
  });
  const metadata = { ...input.metadata, campaignId: campaignId.toString() };
  await dependencies.saveMetadata(metadata);
  await dependencies.writer.publish({
    campaignId,
    merchant: input.merchant,
    signTransaction: input.signTransaction,
  });
  return metadata.campaignId;
}
