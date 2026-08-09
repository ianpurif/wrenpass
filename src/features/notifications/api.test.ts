import { afterEach, describe, expect, it, vi } from "vitest";

import { notificationApi } from "@/features/notifications/api";

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
});
