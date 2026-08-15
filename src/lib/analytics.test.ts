// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: { capture: mocks.capture } }));

import {
  captureReviewSubmitted,
  captureTransactionSucceeded,
  captureWalletConnected,
} from "@/lib/analytics";

describe("product analytics", () => {
  beforeEach(() => {
    mocks.capture.mockReset();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "project-token");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
  });

  it("captures only allowlisted, non-identifying transaction properties", async () => {
    captureTransactionSucceeded("pass purchase");
    captureTransactionSucceeded("user supplied private text");
    captureWalletConnected("testnet");
    captureReviewSubmitted(5);

    await vi.waitFor(() => {
      expect(mocks.capture.mock.calls).toEqual([
        ["transaction_succeeded", { transaction_kind: "pass_purchase" }],
        ["wallet_connected", { network: "testnet" }],
        ["review_submitted", { rating: 5 }],
      ]);
    });
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain("private text");
  });

  it("does not emit telemetry without production configuration", () => {
    vi.stubEnv("NODE_ENV", "test");
    captureWalletConnected("testnet");
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
