import { describe, expect, it } from "vitest";

import {
  formatUsdcAmount,
  parseUsdcAmount,
  quoteCampaignInput,
  toCampaignTerms,
} from "@/features/merchant/campaign-terms";

describe("campaign terms", () => {
  it("converts USDC values without floating-point arithmetic", () => {
    expect(parseUsdcAmount("5.25")).toBe(BigInt(52_500_000));
    expect(formatUsdcAmount(BigInt(52_500_000))).toBe("5.25");
    expect(quoteCampaignInput({ passPrice: "5", serviceValue: "6" })).toEqual({
      bonus: BigInt(10_000_000),
      merchantRelease: BigInt(37_500_000),
      protectedReserve: BigInt(10_000_000),
      platformFee: BigInt(2_500_000),
    });
  });

  it("rejects excessive precision and service value without a customer bonus", () => {
    expect(() => parseUsdcAmount("1.00000001")).toThrow(/7 decimal places/);
    expect(() =>
      toCampaignTerms({
        name: "Future haircut",
        serviceDescription: "A complete haircut service at the merchant location.",
        passPrice: "5",
        serviceValue: "5",
        maxSupply: 10,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).toThrow(/Service value must be greater/);
  });
});
