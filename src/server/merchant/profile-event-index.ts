import "server-only";

import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

import type { StellarConfig } from "@/lib/stellar/config";
import type { EntityRepository } from "@/server/firestore/repositories";
import {
  entityIdSchema,
  indexedBlockchainEventSchema,
  sha256Schema,
  type IndexedBlockchainEvent,
} from "@/server/models";
import { StellarMetadataProfileEventSource } from "@/server/merchant/profile-event-source";

export const MERCHANT_PROFILE_EVENT_TYPE = "merchant_profile_set";

export const merchantProfileEventReferenceSchema = z.object({
  contractId: entityIdSchema,
  merchantWalletAddress: z
    .string()
    .refine(StrKey.isValidEd25519PublicKey, "must be a valid Stellar account"),
  transactionHash: sha256Schema,
  ledger: z.number().int().positive(),
  eventIndex: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
  sourceEventId: entityIdSchema,
});

export type MerchantProfileEventReference = z.infer<
  typeof merchantProfileEventReferenceSchema
>;

interface MerchantProfileEventSource {
  readRetainedReferences(): Promise<MerchantProfileEventReference[]>;
}

export function merchantProfileEventIndexId(
  contractId: string,
  merchantWalletAddress: string,
): string {
  const merchant = merchantProfileEventReferenceSchema.shape.merchantWalletAddress.parse(
    merchantWalletAddress,
  );
  return entityIdSchema.parse(
    `merchant-profile-${entityIdSchema.parse(contractId)}-${merchant}`,
  );
}

export function toIndexedMerchantProfileEvent(
  reference: MerchantProfileEventReference,
): IndexedBlockchainEvent {
  const validated = merchantProfileEventReferenceSchema.parse(reference);
  return indexedBlockchainEventSchema.parse({
    id: merchantProfileEventIndexId(
      validated.contractId,
      validated.merchantWalletAddress,
    ),
    contractId: validated.contractId,
    transactionHash: validated.transactionHash,
    eventIndex: validated.eventIndex,
    ledger: validated.ledger,
    eventType: MERCHANT_PROFILE_EVENT_TYPE,
    payload: {
      merchantWalletAddress: validated.merchantWalletAddress,
      sourceEventId: validated.sourceEventId,
    },
    indexedAt: validated.occurredAt,
  });
}

export function fromIndexedMerchantProfileEvent(
  event: IndexedBlockchainEvent,
  expectedContractId: string,
): MerchantProfileEventReference | null {
  if (
    event.contractId !== expectedContractId ||
    event.eventType !== MERCHANT_PROFILE_EVENT_TYPE ||
    typeof event.payload.merchantWalletAddress !== "string" ||
    typeof event.payload.sourceEventId !== "string"
  ) {
    return null;
  }
  if (
    event.id !== merchantProfileEventIndexId(
      expectedContractId,
      event.payload.merchantWalletAddress,
    )
  ) {
    return null;
  }

  const parsed = merchantProfileEventReferenceSchema.safeParse({
    contractId: event.contractId,
    merchantWalletAddress: event.payload.merchantWalletAddress,
    transactionHash: event.transactionHash,
    ledger: event.ledger,
    eventIndex: event.eventIndex,
    occurredAt: event.indexedAt,
    sourceEventId: event.payload.sourceEventId,
  });
  return parsed.success ? parsed.data : null;
}

function newestProfileEvent(
  references: MerchantProfileEventReference[],
  merchantWalletAddress: string,
): MerchantProfileEventReference | null {
  return references
    .filter((reference) => reference.merchantWalletAddress === merchantWalletAddress)
    .sort((left, right) =>
      right.ledger - left.ledger || right.eventIndex - left.eventIndex)[0] ?? null;
}

export class MerchantProfileEventIndex {
  constructor(
    private readonly config: StellarConfig,
    private readonly events: EntityRepository<IndexedBlockchainEvent>,
    private readonly source: MerchantProfileEventSource =
      new StellarMetadataProfileEventSource(config),
  ) {}

  async indexLatest(merchantWalletAddress: string): Promise<void> {
    const merchant = merchantProfileEventReferenceSchema.shape.merchantWalletAddress.parse(
      merchantWalletAddress,
    );
    const latest = newestProfileEvent(
      await this.source.readRetainedReferences(),
      merchant,
    );
    if (!latest) {
      throw new Error("The confirmed merchant profile event is not retained by Stellar RPC.");
    }
    await this.events.save(toIndexedMerchantProfileEvent(latest));
  }

  async listMerchantWallets(): Promise<string[]> {
    const stored = await this.events.findByField(
      "eventType",
      MERCHANT_PROFILE_EVENT_TYPE,
    );
    const merchants = new Set<string>();
    for (const event of stored) {
      const reference = fromIndexedMerchantProfileEvent(
        event,
        this.config.metadataContractId,
      );
      if (reference) merchants.add(reference.merchantWalletAddress);
    }
    return [...merchants];
  }
}
