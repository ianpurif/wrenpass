import { FieldPath, type QueryDocumentSnapshot } from "firebase-admin/firestore";

import { campaignEventKey } from "@/server/campaign-transactions/campaign-event-key";
import { closeFirebaseApp, getFirestoreDb } from "@/server/firestore/firebase-admin";
import { indexedBlockchainEventSchema } from "@/server/models";

const PAGE_SIZE = 200;

async function migrateCampaignTransactionIndex(): Promise<void> {
  const db = getFirestoreDb();
  let lastDocument: QueryDocumentSnapshot | undefined;
  let scanned = 0;
  let updated = 0;

  while (true) {
    let query = db
      .collection("indexed_blockchain_events")
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (lastDocument) query = query.startAfter(lastDocument);

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let batchUpdates = 0;
    for (const document of snapshot.docs) {
      scanned += 1;
      const event = indexedBlockchainEventSchema.parse(document.data());
      if (
        event.eventType !== "pass_purchased" ||
        typeof event.payload.campaignId !== "string"
      ) {
        continue;
      }
      const key = campaignEventKey(event.payload.campaignId, event.id);
      if (event.campaignEventKey === key) continue;
      batch.update(document.ref, { campaignEventKey: key });
      batchUpdates += 1;
    }
    if (batchUpdates > 0) {
      await batch.commit();
      updated += batchUpdates;
    }
    lastDocument = snapshot.docs.at(-1);
  }

  console.log(`Campaign transaction index migration complete: ${scanned} scanned, ${updated} updated.`);
}

migrateCampaignTransactionIndex()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Campaign transaction migration failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeFirebaseApp();
  });
