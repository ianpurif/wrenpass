import { describe, expect, it, vi } from "vitest";

import type { DocumentStore } from "@/server/firestore/document-store";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import type { UserProfile } from "@/server/models";

function createStore(): DocumentStore {
  const documents = new Map<string, unknown>();
  const key = (collection: string, id: string) => `${collection}/${id}`;

  return {
    read: vi.fn(async (collection, id) => documents.get(key(collection, id)) ?? null),
    findMany: vi.fn(async (collection, field, value) =>
      [...documents.entries()]
        .filter(([documentKey, document]) => {
          if (!documentKey.startsWith(`${collection}/`)) return false;
          return (document as Record<string, unknown>)[field] === value;
        })
        .map(([, document]) => document),
    ),
    write: vi.fn(async (collection, id, data) => {
      documents.set(key(collection, id), data);
    }),
    remove: vi.fn(async (collection, id) => {
      documents.delete(key(collection, id));
    }),
  };
}

const userProfile: UserProfile = {
  id: "user-1",
  walletAddress: "GTESTWALLET",
  displayName: "Ari",
  createdAt: "2026-08-09T04:00:00.000Z",
  updatedAt: "2026-08-09T04:00:00.000Z",
};

describe("off-chain repositories", () => {
  it("validates, writes, reads, and deletes a document", async () => {
    const repositories = createOffchainRepositories(createStore());

    await repositories.userProfiles.save(userProfile);
    await expect(repositories.userProfiles.findById(userProfile.id)).resolves.toEqual(userProfile);

    await repositories.userProfiles.deleteById(userProfile.id);
    await expect(repositories.userProfiles.findById(userProfile.id)).resolves.toBeNull();
  });

  it("rejects invalid documents before writing", async () => {
    const store = createStore();
    const repositories = createOffchainRepositories(store);

    await expect(
      repositories.userProfiles.save({ ...userProfile, walletAddress: "" }),
    ).rejects.toThrow();
    expect(store.write).not.toHaveBeenCalled();
  });

  it("finds and validates documents by a controlled field", async () => {
    const repositories = createOffchainRepositories(createStore());
    await repositories.userProfiles.save(userProfile);
    await repositories.userProfiles.save({
      ...userProfile,
      id: "user-2",
      walletAddress: "GOTHER",
    });

    await expect(
      repositories.userProfiles.findByField("walletAddress", userProfile.walletAddress),
    ).resolves.toEqual([userProfile]);
  });

  it("rejects document IDs containing collection path separators", async () => {
    const store = createStore();
    const repositories = createOffchainRepositories(store);

    await expect(repositories.userProfiles.findById("users/another-user")).rejects.toThrow(
      "path separators",
    );
    expect(store.read).not.toHaveBeenCalled();
  });

  it("omits optional undefined values before writing to Firestore", async () => {
    const store = createStore();
    const repositories = createOffchainRepositories(store);

    await repositories.userProfiles.save({ ...userProfile, displayName: undefined });

    expect(store.write).toHaveBeenCalledWith(
      "user_profiles",
      userProfile.id,
      expect.not.objectContaining({ displayName: expect.anything() }),
    );
  });
});
