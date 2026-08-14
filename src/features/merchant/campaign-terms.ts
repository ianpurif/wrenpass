import { z } from "zod";

import type { CampaignTerms } from "@/generated/wrenpass-contract/src";

export const USDC_SCALE = BigInt(10_000_000);
export const FINANCIAL_RULES = {
  merchant_bps: 7_500,
  reserve_bps: 2_000,
  platform_fee_bps: 500,
} as const;

const MAX_U32 = 4_294_967_295;
const ZERO = BigInt(0);
const BASIS_POINTS_TOTAL = BigInt(10_000);
const MAX_I128 = (BigInt(1) << BigInt(127)) - BigInt(1);
const decimalUsdcPattern = /^(?:0|[1-9]\d*)(?:\.(\d{1,7}))?$/;

function parseUsdcUnits(value: string, allowZero: boolean): bigint {
  const normalized = value.trim();
  const match = decimalUsdcPattern.exec(normalized);
  if (!match) {
    throw new Error("Use a positive USDC amount with no more than 7 decimal places.");
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");
  const amount = BigInt(wholePart) * USDC_SCALE + BigInt(fractionPart.padEnd(7, "0") || "0");
  if (allowZero ? amount < ZERO : amount <= ZERO) {
    throw new Error("Amount must be greater than zero.");
  }
  return amount;
}

export function parseUsdcAmount(value: string): bigint {
  return parseUsdcUnits(value, false);
}

export function parseUsdcBalance(value: string): bigint {
  return parseUsdcUnits(value, true);
}

export function formatUsdcAmount(amount: bigint): string {
  const sign = amount < ZERO ? "-" : "";
  const absolute = amount < ZERO ? -amount : amount;
  const whole = absolute / USDC_SCALE;
  const fraction = (absolute % USDC_SCALE).toString().padStart(7, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

function distributionIsValid(price: bigint): boolean {
  const reserve = (price * BigInt(FINANCIAL_RULES.reserve_bps)) / BASIS_POINTS_TOTAL;
  const fee = (price * BigInt(FINANCIAL_RULES.platform_fee_bps)) / BASIS_POINTS_TOTAL;
  return reserve > ZERO && fee > ZERO;
}

export const merchantProfileInputSchema = z.object({
  businessName: z.string().trim().min(2).max(140),
  description: z.string().trim().min(20).max(2_000),
});

export const campaignInputSchema = z
  .object({
    name: z.string().trim().min(3).max(140),
    serviceDescription: z.string().trim().min(20).max(4_000),
    passPrice: z.string().trim(),
    serviceValue: z.string().trim(),
    maxSupply: z.coerce.number().int().positive().max(MAX_U32),
    expiresAt: z.string().trim().min(1, "Choose an expiration date and time."),
  })
  .superRefine((value, context) => {
    let price: bigint;
    let serviceValue: bigint;

    try {
      price = parseUsdcAmount(value.passPrice);
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["passPrice"],
        message: error instanceof Error ? error.message : "Enter a valid pass price.",
      });
      return;
    }

    try {
      serviceValue = parseUsdcAmount(value.serviceValue);
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["serviceValue"],
        message: error instanceof Error ? error.message : "Enter a valid service value.",
      });
      return;
    }

    if (serviceValue <= price) {
      context.addIssue({
        code: "custom",
        path: ["serviceValue"],
        message: "Service value must be greater than the purchase price.",
      });
    }

    if (!distributionIsValid(price)) {
      context.addIssue({
        code: "custom",
        path: ["passPrice"],
        message: "Price is too small for the protected reserve and platform fee.",
      });
    }

    if (price * BigInt(value.maxSupply) > MAX_I128) {
      context.addIssue({
        code: "custom",
        path: ["maxSupply"],
        message: "Price multiplied by supply exceeds the contract limit.",
      });
    }

    const expiresAt = Date.parse(value.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Expiration must be in the future.",
      });
    }
  });

export type MerchantProfileInput = z.infer<typeof merchantProfileInputSchema>;
export type CampaignInput = z.infer<typeof campaignInputSchema>;

export function toCampaignTerms(input: CampaignInput): CampaignTerms {
  const validated = campaignInputSchema.parse(input);
  return {
    pass_price: parseUsdcAmount(validated.passPrice),
    service_value: parseUsdcAmount(validated.serviceValue),
    max_supply: validated.maxSupply,
    expires_at: BigInt(Math.floor(Date.parse(validated.expiresAt) / 1_000)),
    financial_rules: FINANCIAL_RULES,
  };
}

export function quoteCampaignInput(input: Pick<CampaignInput, "passPrice" | "serviceValue">) {
  const price = parseUsdcAmount(input.passPrice);
  const serviceValue = parseUsdcAmount(input.serviceValue);
  const reserve = (price * BigInt(FINANCIAL_RULES.reserve_bps)) / BASIS_POINTS_TOTAL;
  const platformFee =
    (price * BigInt(FINANCIAL_RULES.platform_fee_bps)) / BASIS_POINTS_TOTAL;
  return {
    bonus: serviceValue - price,
    merchantRelease: price - reserve - platformFee,
    protectedReserve: reserve,
    platformFee,
  };
}

export function quoteCampaignFunding(
  input: Pick<CampaignInput, "passPrice" | "serviceValue" | "maxSupply">,
) {
  const perPass = quoteCampaignInput(input);
  if (!Number.isSafeInteger(input.maxSupply) || input.maxSupply <= 0) {
    throw new Error("Maximum passes must be a positive whole number.");
  }
  const supply = BigInt(input.maxSupply);
  const price = parseUsdcAmount(input.passPrice);
  return {
    perPass,
    totals: {
      customerPayments: price * supply,
      merchantRelease: perPass.merchantRelease * supply,
      protectedReserve: perPass.protectedReserve * supply,
      platformFee: perPass.platformFee * supply,
    },
  };
}
