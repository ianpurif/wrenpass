import { afterEach, describe, expect, it, vi } from "vitest";

import { customerApi } from "@/features/customer/api";

describe("customerApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["Redeemed", "Refunded"] as const)(
    "accepts a %s lifecycle activity event",
    async (kind) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              passes: [],
              activity: [
                {
                  id: kind.toLowerCase(),
                  kind,
                  campaignId: "1",
                  passId: "1",
                  occurredAt: "2026-08-09T10:00:00.000Z",
                  transactionHash: "a".repeat(64),
                },
              ],
              activityWindowStartsAt: "2026-08-01T00:00:00.000Z",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      );

      await expect(customerApi.getDashboard()).resolves.toMatchObject({
        activity: [{ kind }],
      });
    },
  );
});
