import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

import { getStellarConfig } from "@/lib/stellar/config";
import { StellarMetadataContractReader } from "@/lib/stellar/metadata-client";
import { readContractCampaignCount } from "@/lib/stellar/wrenpass-client";
import { closeFirebaseApp, getFirestoreDb } from "@/server/firestore/firebase-admin";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import {
  fromIndexedMerchantProfileEvent,
  merchantProfileEventIndexId,
  toIndexedMerchantProfileEvent,
  type MerchantProfileEventReference,
} from "@/server/merchant/profile-event-index";
import { StellarMetadataProfileEventSource } from "@/server/merchant/profile-event-source";

const LEGACY_COLLECTION = "metadata_registry_entries";

const legacyProfileLocatorSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.literal("merchant_profile"),
  ownerWalletAddress: z
    .string()
    .refine(StrKey.isValidEd25519PublicKey, "must be a valid Stellar account"),
  updatedAt: z.string().datetime(),
});

function latestByMerchant(
  references: MerchantProfileEventReference[],
): Map<string, MerchantProfileEventReference> {
  const latest = new Map<string, MerchantProfileEventReference>();
  for (const reference of references) {
    const existing = latest.get(reference.merchantWalletAddress);
    if (
      !existing ||
      reference.ledger > existing.ledger ||
      (reference.ledger === existing.ledger &&
        reference.eventIndex > existing.eventIndex)
    ) {
      latest.set(reference.merchantWalletAddress, reference);
    }
  }
  return latest;
}

function assertSameReference(
  expected: MerchantProfileEventReference,
  actual: MerchantProfileEventReference,
): void {
  for (const field of [
    "contractId",
    "merchantWalletAddress",
    "transactionHash",
    "ledger",
    "eventIndex",
    "sourceEventId",
  ] as const) {
    if (expected[field] !== actual[field]) {
      throw new Error(
        `Merchant ${expected.merchantWalletAddress} differs at ${field}.`,
      );
    }
  }
}

async function run(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const config = getStellarConfig();
  const db = getFirestoreDb();
  const repositories = createOffchainRepositories();
  const metadata = new StellarMetadataContractReader(config);

  try {
    const [legacySnapshot, retainedEvents, campaignCount] = await Promise.all([
      db.collection(LEGACY_COLLECTION).get(),
      new StellarMetadataProfileEventSource(config).readRetainedReferences(),
      readContractCampaignCount(config),
    ]);
    const legacyLocators = legacySnapshot.docs.map((document) => {
      const parsed = legacyProfileLocatorSchema.parse(document.data());
      if (document.id !== parsed.id) {
        throw new Error(`Legacy profile locator ${document.id} has a mismatched ID.`);
      }
      if (parsed.id !== `merchant-profile:${parsed.ownerWalletAddress}`) {
        throw new Error(`Legacy profile locator ${document.id} has an invalid owner key.`);
      }
      return parsed;
    });
    const latestEvents = latestByMerchant(retainedEvents);
    const merchants = new Set(latestEvents.keys());
    for (const locator of legacyLocators) {
      merchants.add(locator.ownerWalletAddress);
    }
    for (
      let campaignId = BigInt(1);
      campaignId <= campaignCount;
      campaignId += BigInt(1)
    ) {
      const campaignMetadata = await metadata.getCampaignMetadata(campaignId);
      if (!campaignMetadata) {
        throw new Error(`Campaign #${campaignId} has no on-chain metadata.`);
      }
      merchants.add(campaignMetadata.merchant);
    }

    for (const merchant of merchants) {
      const profile = await metadata.getMerchantProfile(merchant);
      const retained = latestEvents.get(merchant);
      if (!profile || profile.owner !== merchant) {
        throw new Error(`Merchant ${merchant} has no matching on-chain profile.`);
      }
      if (!retained) {
        throw new Error(
          `Merchant ${merchant} has no retained profile event; the legacy locators were not changed.`,
        );
      }
    }

    let indexedCount = 0;
    for (const merchant of merchants) {
      const expected = latestEvents.get(merchant)!;
      const stored = await repositories.indexedBlockchainEvents.findById(
        merchantProfileEventIndexId(config.metadataContractId, merchant),
      );
      if (!stored) continue;
      const actual = fromIndexedMerchantProfileEvent(
        stored,
        config.metadataContractId,
      );
      if (!actual) throw new Error(`Merchant ${merchant} has an invalid event record.`);
      assertSameReference(expected, actual);
      indexedCount += 1;
    }

    console.log(
      `Verified ${merchants.size} on-chain merchant profiles, ${retainedEvents.length} retained profile events, ${indexedCount} unified event records, and ${legacyLocators.length} legacy locators.`,
    );
    if (!apply) {
      console.log("Dry run complete. Use --apply to backfill the unified event index.");
      return;
    }

    for (const merchant of merchants) {
      const reference = latestEvents.get(merchant)!;
      await repositories.indexedBlockchainEvents.save(
        toIndexedMerchantProfileEvent(reference),
      );
    }
    for (const merchant of merchants) {
      const expected = latestEvents.get(merchant)!;
      const stored = await repositories.indexedBlockchainEvents.findById(
        merchantProfileEventIndexId(config.metadataContractId, merchant),
      );
      if (!stored) throw new Error(`Merchant ${merchant} was not backfilled.`);
      const actual = fromIndexedMerchantProfileEvent(
        stored,
        config.metadataContractId,
      );
      if (!actual) throw new Error(`Merchant ${merchant} failed read-back validation.`);
      assertSameReference(expected, actual);
    }

    for (const document of legacySnapshot.docs) {
      await document.ref.delete();
    }
    const remaining = await db.collection(LEGACY_COLLECTION).get();
    if (!remaining.empty) {
      throw new Error("The legacy metadata locator collection was not fully removed.");
    }
    console.log(
      `Backfilled and verified ${merchants.size} merchant profile events; removed ${legacyLocators.length} legacy locators.`,
    );
  } finally {
    await closeFirebaseApp();
  }
}

run().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Metadata profile index migration failed.",
  );
  process.exitCode = 1;
});
