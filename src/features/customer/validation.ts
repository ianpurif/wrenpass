import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

export const giftRecipientSchema = z.object({
  recipient: z
    .string()
    .trim()
    .refine(StrKey.isValidEd25519PublicKey, "Enter a valid Stellar G-address."),
});

export type GiftRecipientInput = z.infer<typeof giftRecipientSchema>;
