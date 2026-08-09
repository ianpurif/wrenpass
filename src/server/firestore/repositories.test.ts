import { describe, expect, it, vi } from "vitest";

import type { DocumentStore } from "@/server/firestore/document-store";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import type { UserProfile } from "@/server/models";

function createStore(): DocumentStore {
  const documents = new Map<string, unknown>();
  const key = (collection: string, id: string) => `${collection}/${id}`;

  return {
    read: vi.fn(async (collection, id) => documents.get(key(collection, id)) ?? null),
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

  it("rejects document IDs containing collection path separators", async () => {
    const store = createStore();
    const repositories = createOffchainRepositories(store);

    await expect(repositories.userProfiles.findById("users/another-user")).rejects.toThrow(
      "path separators",
    );
    expect(store.read).not.toHaveBeenCalled();
  });
});
