import { afterEach, describe, expect, it, vi } from "vitest";

import { notificationApi, syncEventsAfterMutation } from "@/features/notifications/api";

describe("notificationApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses a saved email response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ email: "owner@example.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(notificationApi.saveEmail("owner@example.com")).resolves.toEqual({
      email: "owner@example.com",
    });
  });

  it("turns an empty server failure into a useful error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    await expect(notificationApi.saveEmail("owner@example.com")).rejects.toThrow(
      "The notification request failed.",
    );
  });

  it("does not leak an HTML server failure as a JSON parsing error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>Server error</html>", { status: 500, headers: { "Content-Type": "text/html" } }),
      ),
    );

    await expect(notificationApi.saveEmail("owner@example.com")).rejects.toThrow(
      "The notification service is temporarily unavailable.",
    );
  });

  it("treats a post-transaction sync failure as deferred work", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(syncEventsAfterMutation()).resolves.toBe(false);
  });

  it("deduplicates overlapping post-transaction sync requests", async () => {
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const first = syncEventsAfterMutation();
    const second = syncEventsAfterMutation();
    expect(fetchMock).toHaveBeenCalledOnce();

    resolveResponse(new Response(JSON.stringify({
      indexed: 0,
      duplicates: 4,
      notificationsSent: 0,
      notificationFailures: 0,
    }), { status: 200 }));

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it("sends the confirmed transaction ledger to the event reconciler", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      indexed: 1,
      duplicates: 0,
      notificationsSent: 0,
      notificationFailures: 0,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(syncEventsAfterMutation("a".repeat(64), 123_456)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/events/sync",
      expect.objectContaining({
        body: JSON.stringify({
          transactionHash: "a".repeat(64),
          ledger: 123_456,
        }),
      }),
    );
  });
});
