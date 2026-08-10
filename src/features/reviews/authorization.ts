import { Buffer } from "buffer";
import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";

import type { ReviewInput } from "@/features/reviews/validation";

export class ReviewAuthorizationError extends Error {}

export function assertReviewAuthorization(
  entry: xdr.SorobanAuthorizationEntry,
  input: { contractId: string; reviewer: string; review: ReviewInput },
): void {
  const credentials = entry.credentials();
  if (credentials.switch().name !== "sorobanCredentialsAddress") {
    throw new ReviewAuthorizationError(
      "The review authorization has invalid credentials.",
    );
  }
  const authorizedAddress = Address.fromScAddress(
    credentials.address().address(),
  ).toString();
  if (authorizedAddress !== input.reviewer) {
    throw new ReviewAuthorizationError(
      "The review authorization belongs to another wallet.",
    );
  }

  const root = entry.rootInvocation();
  if (
    root.function().switch().name !== "sorobanAuthorizedFunctionTypeContractFn" ||
    root.subInvocations().length !== 0
  ) {
    throw new ReviewAuthorizationError(
      "The review authorization contains unexpected actions.",
    );
  }
  const contractCall = root.function().contractFn();
  const contractId = Address.fromScAddress(contractCall.contractAddress()).toString();
  const functionName = Buffer.from(contractCall.functionName()).toString("utf8");
  const args = contractCall.args().map((argument) => scValToNative(argument) as unknown);
  if (
    contractId !== input.contractId ||
    functionName !== "submit_review" ||
    args.length !== 3 ||
    args[0] !== input.reviewer ||
    args[1] !== input.review.rating ||
    args[2] !== input.review.message
  ) {
    throw new ReviewAuthorizationError(
      "The review authorization does not match this review.",
    );
  }
}
