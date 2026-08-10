import { z } from "zod";

export const REVIEW_MESSAGE_MAX_CHARACTERS = 280;
export const REVIEW_MESSAGE_MAX_BYTES = 500;

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1, "Choose a star rating.").max(5, "Choose a star rating."),
  message: z
    .string()
    .trim()
    .min(3, "Write at least 3 characters.")
    .max(REVIEW_MESSAGE_MAX_CHARACTERS, `Keep your review under ${REVIEW_MESSAGE_MAX_CHARACTERS} characters.`)
    .refine(
      (message) => new TextEncoder().encode(message).length <= REVIEW_MESSAGE_MAX_BYTES,
      "Your review is too large to store on-chain. Shorten it and try again.",
    ),
});

export type ReviewInput = z.infer<typeof reviewInputSchema>;
