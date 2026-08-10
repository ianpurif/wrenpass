import "server-only";

import {
  Address,
  BASE_FEE,
  Keypair,
  Operation,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import {
  assertReviewAuthorization,
  ReviewAuthorizationError,
} from "@/features/reviews/authorization";
import type { ReviewInput } from "@/features/reviews/validation";
import { reviewInputSchema } from "@/features/reviews/validation";
import type { StellarConfig } from "@/lib/stellar/config";
import type { EntityRepository } from "@/server/firestore/repositories";
import type { IndexedBlockchainEvent } from "@/server/models";
import { toIndexedReviewEvent } from "@/server/reviews/review-event-index";

const AUTH_VALIDITY_LEDGERS = 100;
const MAX_SPONSORED_FEE_STROOPS = BigInt(1_000_000);

export class ReviewSponsorshipError extends Error {}

interface PreparedReviewAuthorization {
  authorizationEntry: string;
  expiresAtLedger: number;
}

interface SponsoredReviewResult {
  reviewId: bigint;
  transactionHash: string;
  ledger: number;
}

interface ReviewRpc {
  getAccount(address: string): ReturnType<rpc.Server["getAccount"]>;
  getLatestLedger(): ReturnType<rpc.Server["getLatestLedger"]>;
  simulateTransaction(
    transaction: Parameters<rpc.Server["simulateTransaction"]>[0],
  ): ReturnType<rpc.Server["simulateTransaction"]>;
  prepareTransaction(
    transaction: Parameters<rpc.Server["prepareTransaction"]>[0],
  ): ReturnType<rpc.Server["prepareTransaction"]>;
  sendTransaction(
    transaction: Parameters<rpc.Server["sendTransaction"]>[0],
  ): ReturnType<rpc.Server["sendTransaction"]>;
  pollTransaction(
    hash: string,
    options?: Parameters<rpc.Server["pollTransaction"]>[1],
  ): ReturnType<rpc.Server["pollTransaction"]>;
}

let submissionQueue: Promise<void> = Promise.resolve();

function enqueueSubmission<T>(task: () => Promise<T>): Promise<T> {
  const result = submissionQueue.then(task, task);
  submissionQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function reviewArguments(reviewer: string, review: ReviewInput): xdr.ScVal[] {
  return [
    Address.fromString(reviewer).toScVal(),
    xdr.ScVal.scvU32(review.rating),
    xdr.ScVal.scvString(review.message),
  ];
}

function buildReviewOperation(
  contractId: string,
  reviewer: string,
  review: ReviewInput,
  auth?: xdr.SorobanAuthorizationEntry[],
) {
  return Operation.invokeContractFunction({
    contract: contractId,
    function: "submit_review",
    args: reviewArguments(reviewer, review),
    ...(auth ? { auth } : {}),
  });
}

function validateReviewAuthorization(
  entry: xdr.SorobanAuthorizationEntry,
  input: { contractId: string; reviewer: string; review: ReviewInput },
): void {
  try {
    assertReviewAuthorization(entry, input);
  } catch (error) {
    if (error instanceof ReviewAuthorizationError) {
      throw new ReviewSponsorshipError(error.message);
    }
    throw new ReviewSponsorshipError("The review authorization is invalid.");
  }
}

function transactionResultCode(response: rpc.Api.SendTransactionResponse): string {
  return response.errorResult?.result().switch().name ?? response.status;
}

export class ReviewSponsorshipService {
  private readonly sponsor: Keypair;
  private readonly server: ReviewRpc;

  constructor(
    private readonly config: StellarConfig,
    sponsorSecret: string,
    private readonly events: EntityRepository<IndexedBlockchainEvent>,
    server?: ReviewRpc,
  ) {
    this.sponsor = Keypair.fromSecret(sponsorSecret);
    this.server = server ?? new rpc.Server(config.rpcUrl);
  }

  private async createTransaction(
    reviewer: string,
    review: ReviewInput,
    auth?: xdr.SorobanAuthorizationEntry[],
  ) {
    const account = await this.server.getAccount(this.sponsor.publicKey());
    return new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        buildReviewOperation(this.config.reviewContractId, reviewer, review, auth),
      )
      .setTimeout(60)
      .build();
  }

  async prepare(
    reviewer: string,
    input: ReviewInput,
  ): Promise<PreparedReviewAuthorization> {
    const review = reviewInputSchema.parse(input);
    const transaction = await this.createTransaction(reviewer, review);
    const simulation = await this.server.simulateTransaction(transaction);
    if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result) {
      throw new ReviewSponsorshipError("The review could not be prepared on Stellar.");
    }
    if (simulation.result.auth.length !== 1) {
      throw new ReviewSponsorshipError(
        "The review contract requested an unexpected authorization set.",
      );
    }
    const entry = simulation.result.auth[0];
    validateReviewAuthorization(entry, {
      contractId: this.config.reviewContractId,
      reviewer,
      review,
    });

    return {
      authorizationEntry: entry.toXDR("base64"),
      expiresAtLedger: simulation.latestLedger + AUTH_VALIDITY_LEDGERS,
    };
  }

  async submit(
    reviewer: string,
    input: ReviewInput & { signedAuthorizationEntry: string },
  ): Promise<SponsoredReviewResult> {
    const review = reviewInputSchema.parse(input);
    let signedAuthorization: xdr.SorobanAuthorizationEntry;
    try {
      signedAuthorization = xdr.SorobanAuthorizationEntry.fromXDR(
        input.signedAuthorizationEntry,
        "base64",
      );
    } catch {
      throw new ReviewSponsorshipError("The signed review authorization is invalid.");
    }
    validateReviewAuthorization(signedAuthorization, {
      contractId: this.config.reviewContractId,
      reviewer,
      review,
    });

    const latest = await this.server.getLatestLedger();
    const credentials = signedAuthorization.credentials().address();
    const expiration = credentials.signatureExpirationLedger();
    if (
      expiration <= latest.sequence ||
      expiration > latest.sequence + AUTH_VALIDITY_LEDGERS
    ) {
      throw new ReviewSponsorshipError("The review authorization has expired.");
    }
    if (credentials.signature().switch().name === "scvVoid") {
      throw new ReviewSponsorshipError("The review authorization is not signed.");
    }

    return enqueueSubmission(async () => {
      const transaction = await this.createTransaction(reviewer, review, [
        signedAuthorization,
      ]);
      const prepared = await this.server.prepareTransaction(transaction);
      if (BigInt(prepared.fee) > MAX_SPONSORED_FEE_STROOPS) {
        throw new ReviewSponsorshipError(
          "The sponsored review fee exceeded its safety limit.",
        );
      }
      prepared.sign(this.sponsor);
      const sent = await this.server.sendTransaction(prepared);
      if (sent.status !== "PENDING" && sent.status !== "DUPLICATE") {
        throw new ReviewSponsorshipError(
          `Stellar rejected the sponsored review: ${transactionResultCode(sent)}.`,
        );
      }

      const result = await this.server.pollTransaction(sent.hash, { attempts: 15 });
      if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        throw new ReviewSponsorshipError(
          result.status === rpc.Api.GetTransactionStatus.NOT_FOUND
            ? "The sponsored review is still pending. Try again shortly."
            : "Stellar rejected the sponsored review.",
        );
      }
      const nativeResult = result.returnValue
        ? (scValToNative(result.returnValue) as unknown)
        : null;
      if (typeof nativeResult !== "bigint" || nativeResult <= BigInt(0)) {
        throw new ReviewSponsorshipError(
          "Stellar confirmed the review without returning its review ID.",
        );
      }

      try {
        await this.events.save(
          toIndexedReviewEvent({
            id: nativeResult.toString(),
            contractId: this.config.reviewContractId,
            reviewerWalletAddress: reviewer,
            transactionHash: sent.hash,
            ledger: result.ledger,
            createdAt: new Date().toISOString(),
          }),
        );
      } catch (error) {
        console.error("Review event indexing failed after Stellar confirmation.", error);
      }
      return {
        reviewId: nativeResult,
        transactionHash: sent.hash,
        ledger: result.ledger,
      };
    });
  }
}
