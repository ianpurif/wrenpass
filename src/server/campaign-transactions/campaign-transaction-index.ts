import "server-only";

import type { Firestore, Query } from "firebase-admin/firestore";
import { z } from "zod";

import type {
  CampaignTransactionDto,
  CampaignTransactionPageDto,
} from "@/features/campaign-transactions/dto";
import {
  campaignEventKey,
  campaignEventPrefix,
  decodeCampaignTransactionCursor,
  encodeCampaignTransactionCursor,
} from "@/server/campaign-transactions/campaign-event-key";
import { getFirestoreDb } from "@/server/firestore/firebase-admin";
import {
  indexedBlockchainEventSchema,
  sha256Schema,
  type IndexedBlockchainEvent,
} from "@/server/models";

interface IndexedEventPage {
  events: IndexedBlockchainEvent[];
  hasMore: boolean;
  nextKey: string | null;
}

export interface CampaignTransactionPageStore {
  readPage(input: {
    campaignId: string;
    afterKey?: string;
    limit: number;
  }): Promise<IndexedEventPage>;
}

export class FirestoreCampaignTransactionPageStore
implements CampaignTransactionPageStore {
  constructor(private readonly db: Firestore = getFirestoreDb()) {}

  async readPage(input: {
    campaignId: string;
    afterKey?: string;
    limit: number;
  }): Promise<IndexedEventPage> {
    const prefix = campaignEventPrefix(input.campaignId);
    let query: Query = this.db
      .collection("indexed_blockchain_events")
      .where("campaignEventKey", ">=", prefix)
      .where("campaignEventKey", "<", `${prefix}\uf8ff`)
      .orderBy("campaignEventKey", "desc")
      .limit(input.limit + 1);
    if (input.afterKey) query = query.startAfter(input.afterKey);

    const snapshot = await query.get();
    const hasMore = snapshot.docs.length > input.limit;
    const visible = snapshot.docs.slice(0, input.limit);
    const events = visible.map((document) =>
      indexedBlockchainEventSchema.parse(document.data()),
    );
    let nextKey: string | null = null;
    if (hasMore) {
      const lastKey = events.at(-1)?.campaignEventKey;
      if (!lastKey) {
        throw new Error("Indexed purchase page is missing its pagination key.");
      }
      nextKey = lastKey;
    }
    return { events, hasMore, nextKey };
  }
}

function readIntegerString(value: unknown, label: string): string {
  const parsed = integerStringSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Indexed purchase event has an invalid ${label}.`);
  return parsed.data;
}

const integerStringSchema = z.string().regex(/^\d+$/);
const positiveIntegerStringSchema = z.string().regex(/^[1-9]\d*$/);

function toTransactionDto(
  campaignId: string,
  event: IndexedBlockchainEvent,
): CampaignTransactionDto {
  const passId = positiveIntegerStringSchema.safeParse(event.payload.passId);
  if (!passId.success) {
    throw new Error("Indexed purchase event has an invalid pass ID.");
  }
  const total = readIntegerString(event.payload.total, "total");
  if (
    event.eventType !== "pass_purchased" ||
    event.payload.campaignId !== campaignId ||
    event.campaignEventKey !== campaignEventKey(campaignId, event.id)
  ) {
    throw new Error("Indexed purchase event does not match the requested campaign.");
  }
  return {
    id: event.id,
    transactionHash: sha256Schema.parse(event.transactionHash),
    passId: passId.data,
    total,
    ledger: event.ledger,
  };
}

export class CampaignTransactionIndex {
  constructor(
    private readonly store: CampaignTransactionPageStore =
      new FirestoreCampaignTransactionPageStore(),
  ) {}

  async readPage(input: {
    campaignId: string;
    cursor?: string;
    limit: number;
  }): Promise<CampaignTransactionPageDto> {
    const afterKey = input.cursor
      ? decodeCampaignTransactionCursor(input.campaignId, input.cursor)
      : undefined;
    const page = await this.store.readPage({
      campaignId: input.campaignId,
      afterKey,
      limit: input.limit,
    });
    return {
      transactions: page.events.map((event) =>
        toTransactionDto(input.campaignId, event),
      ),
      nextCursor: page.nextKey
        ? encodeCampaignTransactionCursor(page.nextKey)
        : null,
      hasMore: page.hasMore,
    };
  }
}
