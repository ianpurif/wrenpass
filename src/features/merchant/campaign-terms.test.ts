import { describe, expect, it } from "vitest";

import {
  FINANCIAL_RULES,
  formatUsdcAmount,
  parseUsdcAmount,
  parseUsdcBalance,
  quoteCampaignFunding,
  quoteCampaignInput,
  toCampaignTerms,
} from "@/features/merchant/campaign-terms";

describe("campaign terms", () => {
  it("converts USDC values without floating-point arithmetic", () => {
    expect(parseUsdcAmount("5.25")).toBe(BigInt(52_500_000));
    expect(parseUsdcBalance("0.0000000")).toBe(BigInt(0));
    expect(formatUsdcAmount(BigInt(52_500_000))).toBe("5.25");
    expect(quoteCampaignInput({ passPrice: "5", serviceValue: "6" })).toEqual({
      bonus: BigInt(10_000_000),
      merchantRelease: BigInt(39_500_000),
      protectedReserve: BigInt(10_000_000),
      platformFee: BigInt(500_000),
    });
  });

  it("charges a 1% platform fee while preserving the 20% protection reserve", () => {
    expect(FINANCIAL_RULES).toEqual({
      merchant_bps: 7_900,
      reserve_bps: 2_000,
      platform_fee_bps: 100,
    });
    expect(quoteCampaignInput({ passPrice: "500", serviceValue: "550" })).toEqual({
      bonus: BigInt(500_000_000),
      merchantRelease: BigInt(3_950_000_000),
      protectedReserve: BigInt(1_000_000_000),
      platformFee: BigInt(50_000_000),
    });
  });

  it("projects full campaign funding with integer-safe math", () => {
    expect(quoteCampaignFunding({ passPrice: "5", serviceValue: "6", maxSupply: 100 })).toEqual({
      perPass: {
        bonus: BigInt(10_000_000),
        merchantRelease: BigInt(39_500_000),
        protectedReserve: BigInt(10_000_000),
        platformFee: BigInt(500_000),
      },
      totals: {
        customerPayments: BigInt(5_000_000_000),
        merchantRelease: BigInt(3_950_000_000),
        protectedReserve: BigInt(1_000_000_000),
        platformFee: BigInt(50_000_000),
      },
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
