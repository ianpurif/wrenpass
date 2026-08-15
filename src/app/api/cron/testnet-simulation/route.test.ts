// @vitest-environment node

import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  captureException: vi.fn(),
  reserveRun: vi.fn(),
  run: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("@/server/env", () => ({
  getServerEnv: () => ({ CRON_SECRET: "a-production-length-cron-secret-value" }),
}));
vi.mock("@/server/simulator/testnet-simulation-service", () => ({
  getTestnetSimulationService: () => ({
    reserveRun: mocks.reserveRun,
    run: mocks.run,
  }),
}));

import { GET } from "@/app/api/cron/testnet-simulation/route";

function request(authorization?: string): NextRequest {
  return new Request("https://wrenpass.vercel.app/api/cron/testnet-simulation", {
    headers: authorization ? { authorization } : undefined,
  }) as NextRequest;
}

describe("Testnet simulation cron route", () => {
  beforeEach(() => {
    mocks.after.mockReset();
    mocks.captureException.mockReset();
    mocks.reserveRun.mockReset().mockResolvedValue({ accepted: true });
    mocks.run.mockReset().mockResolvedValue({ walletAddress: "GBUYER" });
  });

  it("rejects requests without the configured bearer credential", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.reserveRun).not.toHaveBeenCalled();
  });

  it("responds immediately and schedules the network work after the response", async () => {
    let backgroundWork: (() => Promise<void>) | undefined;
    mocks.after.mockImplementation((callback: () => Promise<void>) => {
      backgroundWork = callback;
    });

    const response = await GET(request("Bearer a-production-length-cron-secret-value"));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(mocks.run).not.toHaveBeenCalled();
    await backgroundWork?.();
    expect(mocks.run).toHaveBeenCalledOnce();
  });

  it("returns a successful no-op for a duplicate execution window", async () => {
    mocks.reserveRun.mockResolvedValue({
      accepted: false,
      reason: "recently_started",
      retryAfterSeconds: 120,
    });

    const response = await GET(request("Bearer a-production-length-cron-secret-value"));

    expect(response.status).toBe(200);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
