import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

const passIdSchema = z.string().regex(/^[1-9]\d{0,19}$/, "Pass ID is invalid.");

export const redemptionQrPayloadSchema = z.object({
  v: z.literal(1),
  type: z.literal("wrenpass:redeem"),
  network: z.enum(["testnet", "mainnet"]),
  contractId: z.string().refine(StrKey.isValidContract, "Contract ID is invalid."),
  passId: passIdSchema,
});

export type RedemptionQrPayload = z.infer<typeof redemptionQrPayloadSchema>;

export function encodeRedemptionQrPayload(
  payload: Omit<RedemptionQrPayload, "v" | "type">,
): string {
  return JSON.stringify(
    redemptionQrPayloadSchema.parse({ v: 1, type: "wrenpass:redeem", ...payload }),
  );
}

export function parseRedemptionQrPayload(value: string): RedemptionQrPayload {
  if (value.length > 512) throw new Error("This QR code is too large to be a WrenPass QR.");

  try {
    return redemptionQrPayloadSchema.parse(JSON.parse(value) as unknown);
  } catch {
    throw new Error("This is not a valid WrenPass redemption QR code.");
  }
}
