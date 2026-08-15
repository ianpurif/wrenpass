import { afterEach, describe, expect, it, vi } from "vitest";

import { merchantApi } from "@/features/merchant/api";

const walletAddress = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

function dashboardResponse(status = 200) {
  return new Response(
    JSON.stringify(status === 200
      ? { merchant: null, campaigns: [] }
      : { error: "Stellar RPC is temporarily unavailable." }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

describe("merchantApi dashboard", () => {
  afterEach(() => {
    merchantApi.invalidateDashboard(walletAddress);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries one temporary server failure", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(dashboardResponse(503))
      .mockResolvedValueOnce(dashboardResponse());
    vi.stubGlobal("fetch", fetchMock);

    const request = merchantApi.getDashboard(walletAddress);
    await vi.runAllTimersAsync();

    await expect(request).resolves.toEqual({ merchant: null, campaigns: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates overlapping reads for the same verified wallet", async () => {
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const first = merchantApi.getDashboard(walletAddress);
    const second = merchantApi.getDashboard(walletAddress);
    expect(fetchMock).toHaveBeenCalledOnce();
    resolveResponse(dashboardResponse());

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it("reuses a recent dashboard across merchant page navigation", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => dashboardResponse());
    vi.stubGlobal("fetch", fetchMock);

    await merchantApi.getDashboard(walletAddress);
    await merchantApi.getDashboard(walletAddress);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("bypasses the short cache for an explicit refresh", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => dashboardResponse());
    vi.stubGlobal("fetch", fetchMock);

    await merchantApi.getDashboard(walletAddress);
    await merchantApi.getDashboard(walletAddress, { refresh: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an invalid dashboard payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ campaigns: "invalid" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(merchantApi.getDashboard(walletAddress)).rejects.toThrow(
      "The merchant service returned an invalid dashboard.",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses bounded retries instead of leaving the workspace loading forever", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }));
    vi.stubGlobal("fetch", fetchMock);

    const request = merchantApi.getDashboard(walletAddress);
    const expectation = expect(request).rejects.toThrow(
      "Loading the merchant workspace timed out. Please try again.",
    );
    await vi.runAllTimersAsync();

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
