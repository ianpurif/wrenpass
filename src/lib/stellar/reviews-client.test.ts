// @vitest-environment node

import { Buffer } from "buffer";
import {
  Address,
  authorizeInvocation,
  hash,
  Keypair,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import { assertReviewAuthorization } from "@/features/reviews/authorization";
import { StellarReviewContractWriter } from "@/lib/stellar/reviews-client";
import { testStellarConfig } from "@/test/fixtures/customer";

describe("StellarReviewContractWriter", () => {
  it("turns a Freighter preimage signature into the exact signed review authorization", async () => {
    const reviewer = Keypair.random();
    const review = { rating: 5, message: "Clear and useful." };
    const invocation = new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: Address.fromString(
            testStellarConfig.reviewContractId,
          ).toScAddress(),
          functionName: "submit_review",
          args: [
            nativeToScVal(reviewer.publicKey(), { type: "address" }),
            nativeToScVal(review.rating, { type: "u32" }),
            nativeToScVal(review.message, { type: "string" }),
          ],
        }),
      ),
      subInvocations: [],
    });
    const preparedAuthorization = await authorizeInvocation({
      signer: reviewer,
      validUntilLedgerSeq: 120,
      invocation,
      networkPassphrase: testStellarConfig.networkPassphrase,
    });
    const submitSponsoredReview = vi.fn(
      async (input: {
        rating: number;
        message: string;
        signedAuthorizationEntry: string;
      }) => {
        expect(input).toMatchObject(review);
        return {
          reviewId: "1",
          transactionHash: "a".repeat(64),
          ledger: 130,
        };
      },
    );
    const writer = new StellarReviewContractWriter(testStellarConfig, {
      prepareSponsoredReview: vi.fn(async () => ({
        authorizationEntry: preparedAuthorization.toXDR("base64"),
        expiresAtLedger: 150,
      })),
      submitSponsoredReview,
    });

    await writer.submit({
      reviewer: reviewer.publicKey(),
      ...review,
      signAuthEntry: vi.fn(async (preimageXdr) => ({
        signedAuthEntry: reviewer
          .sign(hash(Buffer.from(preimageXdr, "base64")))
          .toString("base64"),
        signerAddress: reviewer.publicKey(),
      })),
    });

    const submission = submitSponsoredReview.mock.calls[0][0];
    const signedAuthorization = xdr.SorobanAuthorizationEntry.fromXDR(
      submission.signedAuthorizationEntry,
      "base64",
    );
    assertReviewAuthorization(signedAuthorization, {
      contractId: testStellarConfig.reviewContractId,
      reviewer: reviewer.publicKey(),
      review,
    });
    expect(
      signedAuthorization.credentials().address().signatureExpirationLedger(),
    ).toBe(150);
    expect(
      signedAuthorization.credentials().address().signature().switch().name,
    ).not.toBe("scvVoid");
  });
});
