import { afterEach, describe, expect, it, vi } from "vitest";

import { customerApi } from "@/features/customer/api";
import { testCustomerAddress } from "@/test/fixtures/customer";

function dashboardResponse(status = 200) {
  return new Response(
    JSON.stringify({
      passes: [],
      activity: [],
      activityWindowStartsAt: "2026-08-01T00:00:00.000Z",
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

describe("customerApi", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

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

      await expect(customerApi.getDashboard(testCustomerAddress)).resolves.toMatchObject({
        activity: [{ kind }],
      });
    },
  );

  it("retries one temporary server failure", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Temporary RPC failure." }), { status: 503 }))
      .mockResolvedValueOnce(dashboardResponse());
    vi.stubGlobal("fetch", fetchMock);

    const request = customerApi.getDashboard(testCustomerAddress);
    await vi.runAllTimersAsync();

    await expect(request).resolves.toMatchObject({ passes: [], activity: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates overlapping requests for the same authenticated wallet", async () => {
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const first = customerApi.getDashboard(testCustomerAddress);
    const second = customerApi.getDashboard(testCustomerAddress);
    expect(fetchMock).toHaveBeenCalledOnce();
    resolveResponse(dashboardResponse());

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it("times out bounded retries instead of loading forever", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }));
    vi.stubGlobal("fetch", fetchMock);

    const request = customerApi.getDashboard(testCustomerAddress);
    const expectation = expect(request).rejects.toThrow(
      "Reading passes from Stellar timed out. Please try again.",
    );
    await vi.runAllTimersAsync();

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
