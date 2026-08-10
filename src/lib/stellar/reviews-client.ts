import { Buffer } from "buffer";
import { authorizeEntry, xdr } from "@stellar/stellar-sdk";

import { assertReviewAuthorization } from "@/features/reviews/authorization";
import { reviewsApi } from "@/features/reviews/api";
import { Client, type Review } from "@/generated/reviews-contract/src";
import { reviewInputSchema, type ReviewInput } from "@/features/reviews/validation";
import type { StellarConfig } from "@/lib/stellar/config";

type SignAuthEntry = (
  authorizationXdr: string,
  options?: { address?: string; networkPassphrase?: string },
) => Promise<{
  signedAuthEntry: string;
  signerAddress?: string;
  error?: { message: string };
}>;

const contractErrorMessages: Record<string, string> = {
  InvalidMessage: "Write a shorter review message and try again.",
  InvalidPageSize: "The requested review page is too large.",
  InvalidRating: "Choose a rating from 1 to 5 stars.",
  Overflow: "The review counter has reached its safe limit.",
};

function unwrapContractResult<T>(result: {
  isErr(): boolean;
  unwrap(): T;
  unwrapErr(): { message: string };
}): T {
  if (result.isErr()) {
    const contractMessage = result.unwrapErr().message;
    throw new Error(contractErrorMessages[contractMessage] ?? `Review contract rejected the action: ${contractMessage}`);
  }
  return result.unwrap();
}

function createClient(config: StellarConfig) {
  return new Client({
    contractId: config.reviewContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
  });
}

export interface SponsoredReviewReceipt {
  reviewId: string;
  transactionHash: string;
  ledger: number;
}

export interface ReviewContractWriter {
  submit(
    input: ReviewInput & { reviewer: string; signAuthEntry: SignAuthEntry },
  ): Promise<SponsoredReviewReceipt>;
}

export class StellarReviewContractWriter implements ReviewContractWriter {
  constructor(
    private readonly config: StellarConfig,
    private readonly api: Pick<
      typeof reviewsApi,
      "prepareSponsoredReview" | "submitSponsoredReview"
    > = reviewsApi,
  ) {}

  async submit(
    input: ReviewInput & { reviewer: string; signAuthEntry: SignAuthEntry },
  ): Promise<SponsoredReviewReceipt> {
    const review = reviewInputSchema.parse(input);
    const prepared = await this.api.prepareSponsoredReview(review);
    const unsignedAuthorization = xdr.SorobanAuthorizationEntry.fromXDR(
      prepared.authorizationEntry,
      "base64",
    );
    assertReviewAuthorization(unsignedAuthorization, {
      contractId: this.config.reviewContractId,
      reviewer: input.reviewer,
      review,
    });

    const signedAuthorization = await authorizeEntry(
      unsignedAuthorization,
      async (preimage) => {
        const signed = await input.signAuthEntry(preimage.toXDR("base64"), {
          address: input.reviewer,
          networkPassphrase: this.config.networkPassphrase,
        });
        if (signed.error) throw new Error(signed.error.message);
        if (signed.signerAddress && signed.signerAddress !== input.reviewer) {
          throw new Error(
            "Freighter authorized the review with a different account.",
          );
        }
        return Buffer.from(signed.signedAuthEntry, "base64");
      },
      prepared.expiresAtLedger,
      this.config.networkPassphrase,
    );

    return this.api.submitSponsoredReview({
      ...review,
      signedAuthorizationEntry: signedAuthorization.toXDR("base64"),
    });
  }
}

export interface ContractReviewPage {
  reviews: Review[];
  nextCursor: bigint | null;
  hasMore: boolean;
}

export async function readContractReviews(
  config: StellarConfig,
  input: { beforeId?: bigint; limit: number },
): Promise<ContractReviewPage> {
  const transaction = await createClient(config).get_reviews({
    before_id: input.beforeId,
    limit: input.limit,
  });
  const reviews = unwrapContractResult(transaction.result);
  const nextCursor = reviews.at(-1)?.id ?? null;

  return {
    reviews,
    nextCursor,
    hasMore: reviews.length === input.limit && nextCursor !== null && nextCursor > BigInt(1),
  };
}

export async function readContractReviewCount(config: StellarConfig): Promise<bigint> {
  const transaction = await createClient(config).review_count();
  return transaction.result;
}
