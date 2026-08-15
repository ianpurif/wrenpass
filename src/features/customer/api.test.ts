import { afterEach, describe, expect, it, vi } from "vitest";

import { customerApi } from "@/features/customer/api";
import { testCustomerAddress } from "@/test/fixtures/customer";

function passResponse(status = 200) {
  return new Response(
    JSON.stringify({ passes: [] }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function activityResponse(status = 200) {
  return new Response(
    JSON.stringify({ activity: [], activityWindowStartsAt: "2026-08-01T00:00:00.000Z" }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

describe("customerApi", () => {
  afterEach(() => {
    customerApi.invalidate(testCustomerAddress);
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

      await expect(customerApi.getActivity(testCustomerAddress)).resolves.toMatchObject({
        activity: [{ kind }],
      });
    },
  );

  it("retries one temporary server failure", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Temporary RPC failure." }), { status: 503 }))
      .mockResolvedValueOnce(passResponse());
    vi.stubGlobal("fetch", fetchMock);

    const request = customerApi.getPasses(testCustomerAddress);
    await vi.runAllTimersAsync();

    await expect(request).resolves.toMatchObject({ passes: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates overlapping requests for the same authenticated wallet", async () => {
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const first = customerApi.getPasses(testCustomerAddress);
    const second = customerApi.getPasses(testCustomerAddress);
    expect(fetchMock).toHaveBeenCalledOnce();
    resolveResponse(passResponse());

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it("reuses recent pass reads across page navigation and supports refresh", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => passResponse());
    vi.stubGlobal("fetch", fetchMock);

    await customerApi.getPasses(testCustomerAddress);
    await customerApi.getPasses(testCustomerAddress);
    await customerApi.getPasses(testCustomerAddress, { refresh: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
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

    const request = customerApi.getPasses(testCustomerAddress);
    const expectation = expect(request).rejects.toThrow(
      "Reading passes from Stellar timed out. Please try again.",
    );
    await vi.runAllTimersAsync();

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("combines independently loaded passes and activity for legacy consumers", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(url.endsWith("/activity") ? activityResponse() : passResponse()));
    vi.stubGlobal("fetch", fetchMock);

    await expect(customerApi.getDashboard(testCustomerAddress)).resolves.toEqual({
      passes: [],
      activity: [],
      activityWindowStartsAt: "2026-08-01T00:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
