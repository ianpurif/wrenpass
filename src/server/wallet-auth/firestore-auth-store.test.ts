// @vitest-environment node

import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import { FirestoreWalletAuthStore } from "@/server/wallet-auth/firestore-auth-store";

describe("FirestoreWalletAuthStore", () => {
  it("removes expired challenges after saving a fresh one", async () => {
    const set = vi.fn(async () => undefined);
    const expiredReference = { id: "expired" };
    const get = vi.fn(async () => ({
      empty: false,
      docs: [{ ref: expiredReference }],
    }));
    const limit = vi.fn(() => ({ get }));
    const where = vi.fn(() => ({ limit }));
    const deleteDocument = vi.fn();
    const commit = vi.fn(async () => undefined);
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ set })),
        where,
      })),
      batch: vi.fn(() => ({ delete: deleteDocument, commit })),
    } as unknown as Firestore;
    const store = new FirestoreWalletAuthStore(db);

    await store.saveChallenge({
      idHash: "a".repeat(64),
      address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      message: "Sign in",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    expect(set).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledWith("expiresAt", "<=", expect.any(String));
    expect(limit).toHaveBeenCalledWith(100);
    expect(deleteDocument).toHaveBeenCalledWith(expiredReference);
    expect(commit).toHaveBeenCalledOnce();
  });

  it("does not fail authentication when opportunistic cleanup is unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const set = vi.fn(async () => undefined);
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ set })),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => {
              throw new Error("Cleanup unavailable");
            }),
          })),
        })),
      })),
    } as unknown as Firestore;
    const store = new FirestoreWalletAuthStore(db);

    await expect(store.saveSession({
      tokenHash: "b".repeat(64),
      address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      createdAt: "2026-08-10T00:00:00.000Z",
      expiresAt: "2026-08-11T00:00:00.000Z",
    })).resolves.toBeUndefined();
    expect(set).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "Unable to clean expired walletAuthSessions records.",
      expect.any(Error),
    );
    warn.mockRestore();
  });
});
