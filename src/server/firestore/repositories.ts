import "server-only";

import type { ZodType } from "zod";

import { FirestoreDocumentStore, type DocumentStore } from "@/server/firestore/document-store";
import {
  cloudinaryAssetReferenceSchema,
  entityIdSchema,
  indexedBlockchainEventSchema,
  metadataRegistryEntrySchema,
  notificationSchema,
  userProfileSchema,
  type CloudinaryAssetReference,
  type IndexedBlockchainEvent,
  type MetadataRegistryEntry,
  type Notification,
  type UserProfile,
} from "@/server/models";

interface IdentifiedEntity {
  id: string;
}

function omitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUndefined);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .map(([key, nested]) => [key, omitUndefined(nested)]),
    );
  }
  return value;
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
      omitUndefined(validated) as Record<string, unknown>,
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
  cloudinaryAssetReferences: EntityRepository<CloudinaryAssetReference>;
  metadataRegistryEntries: EntityRepository<MetadataRegistryEntry>;
  notifications: EntityRepository<Notification>;
  indexedBlockchainEvents: EntityRepository<IndexedBlockchainEvent>;
}

export function createOffchainRepositories(
  store: DocumentStore = new FirestoreDocumentStore(),
): OffchainRepositories {
  return {
    userProfiles: new EntityRepository("user_profiles", userProfileSchema, store),
    cloudinaryAssetReferences: new EntityRepository(
      "cloudinary_asset_references",
      cloudinaryAssetReferenceSchema,
      store,
    ),
    metadataRegistryEntries: new EntityRepository(
      "metadata_registry_entries",
      metadataRegistryEntrySchema,
      store,
    ),
    notifications: new EntityRepository("notifications", notificationSchema, store),
    indexedBlockchainEvents: new EntityRepository(
      "indexed_blockchain_events",
      indexedBlockchainEventSchema,
      store,
    ),
  };
}
