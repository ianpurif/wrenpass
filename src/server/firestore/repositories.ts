import "server-only";

import type { ZodType } from "zod";

import { FirestoreDocumentStore, type DocumentStore } from "@/server/firestore/document-store";
import {
  campaignMetadataSchema,
  entityIdSchema,
  indexedBlockchainEventSchema,
  merchantSchema,
  notificationSchema,
  redemptionRequestSchema,
  userProfileSchema,
  type CampaignMetadata,
  type IndexedBlockchainEvent,
  type Merchant,
  type Notification,
  type RedemptionRequest,
  type UserProfile,
} from "@/server/models";

interface IdentifiedEntity {
  id: string;
}

export class EntityRepository<T extends IdentifiedEntity> {
  constructor(
    private readonly collectionName: string,
    private readonly schema: ZodType<T>,
    private readonly store: DocumentStore,
  ) {}

  async save(entity: T): Promise<T> {
    const validated = this.schema.parse(entity);
    await this.store.write(
      this.collectionName,
      validated.id,
      validated as unknown as Record<string, unknown>,
    );
    return validated;
  }

  async findById(id: string): Promise<T | null> {
    const validatedId = entityIdSchema.parse(id);
    const data = await this.store.read(this.collectionName, validatedId);
    return data === null ? null : this.schema.parse(data);
  }

  async findByField(field: keyof T & string, value: string): Promise<T[]> {
    const documents = await this.store.findMany(this.collectionName, field, value);
    return documents.map((document) => this.schema.parse(document));
  }

  async deleteById(id: string): Promise<void> {
    await this.store.remove(this.collectionName, entityIdSchema.parse(id));
  }
}

export interface OffchainRepositories {
  userProfiles: EntityRepository<UserProfile>;
  merchants: EntityRepository<Merchant>;
  campaignMetadata: EntityRepository<CampaignMetadata>;
  notifications: EntityRepository<Notification>;
  indexedBlockchainEvents: EntityRepository<IndexedBlockchainEvent>;
  redemptionRequests: EntityRepository<RedemptionRequest>;
}

export function createOffchainRepositories(
  store: DocumentStore = new FirestoreDocumentStore(),
): OffchainRepositories {
  return {
    userProfiles: new EntityRepository("user_profiles", userProfileSchema, store),
    merchants: new EntityRepository("merchants", merchantSchema, store),
    campaignMetadata: new EntityRepository(
      "campaign_metadata",
      campaignMetadataSchema,
      store,
    ),
    notifications: new EntityRepository("notifications", notificationSchema, store),
    indexedBlockchainEvents: new EntityRepository(
      "indexed_blockchain_events",
      indexedBlockchainEventSchema,
      store,
    ),
    redemptionRequests: new EntityRepository(
      "redemption_requests",
      redemptionRequestSchema,
      store,
    ),
  };
}
