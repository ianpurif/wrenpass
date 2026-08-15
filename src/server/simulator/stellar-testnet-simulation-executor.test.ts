// @vitest-environment node

import { describe, expect, it } from "vitest";

import { calculateSwapSendMaximum } from "@/server/simulator/stellar-testnet-simulation-executor";

describe("calculateSwapSendMaximum", () => {
  it("adds five percent slippage and rounds up in stroops", () => {
    expect(calculateSwapSendMaximum(56_092_970n)).toBe(58_897_619n);
    expect(calculateSwapSendMaximum(1n)).toBe(2n);
  });
});
