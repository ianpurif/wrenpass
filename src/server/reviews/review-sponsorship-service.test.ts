// @vitest-environment node

import {
  Account,
  Address,
  authorizeInvocation,
  Keypair,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { DocumentStore } from "@/server/firestore/document-store";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import {
  ReviewSponsorshipError,
  ReviewSponsorshipService,
} from "@/server/reviews/review-sponsorship-service";
import { testStellarConfig } from "@/test/fixtures/customer";

function createStore(): DocumentStore {
  const documents = new Map<string, Record<string, unknown>>();
  const key = (collection: string, id: string) => `${collection}/${id}`;
  return {
    read: vi.fn(async (collection, id) => documents.get(key(collection, id)) ?? null),
    findMany: vi.fn(async () => []),
    write: vi.fn(async (collection, id, data) => {
      documents.set(key(collection, id), data);
    }),
    remove: vi.fn(async (collection, id) => {
      documents.delete(key(collection, id));
    }),
  };
}

async function signedReviewAuthorization(input: {
  reviewer: Keypair;
  rating: number;
  message: string;
  contractId?: string;
}) {
  const invocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(
          input.contractId ?? testStellarConfig.reviewContractId,
        ).toScAddress(),
        functionName: "submit_review",
        args: [
          nativeToScVal(input.reviewer.publicKey(), { type: "address" }),
          nativeToScVal(input.rating, { type: "u32" }),
          nativeToScVal(input.message, { type: "string" }),
        ],
      }),
    ),
    subInvocations: [],
  });
  return authorizeInvocation({
    signer: input.reviewer,
    validUntilLedgerSeq: 150,
    invocation,
    networkPassphrase: testStellarConfig.networkPassphrase,
  });
}

describe("ReviewSponsorshipService", () => {
  it("submits only the authorized review and records its transaction receipt", async () => {
    const sponsor = Keypair.random();
    const reviewer = Keypair.random();
    const review = { rating: 5, message: "Clear and useful." };
    const authorization = await signedReviewAuthorization({ reviewer, ...review });
    const sentHash = "a".repeat(64);
    const server = {
      getAccount: vi.fn(async () => new Account(sponsor.publicKey(), "10")),
      getLatestLedger: vi.fn(async () => ({ sequence: 100 })),
      simulateTransaction: vi.fn(),
      prepareTransaction: vi.fn(
        async (transaction: Parameters<rpc.Server["prepareTransaction"]>[0]) => transaction,
      ),
      sendTransaction: vi.fn(async (transaction: Parameters<rpc.Server["sendTransaction"]>[0]) => {
        expect(transaction.signatures).toHaveLength(1);
        return { status: "PENDING" as const, hash: sentHash } as rpc.Api.SendTransactionResponse;
      }),
      pollTransaction: vi.fn(async () => ({
        status: rpc.Api.GetTransactionStatus.SUCCESS,
        txHash: sentHash,
        ledger: 120,
        returnValue: xdr.ScVal.scvU64(xdr.Uint64.fromString("1")),
      }) as rpc.Api.GetSuccessfulTransactionResponse),
    };
    const receipts = createOffchainRepositories(createStore()).reviewReceipts;
    const service = new ReviewSponsorshipService(
      testStellarConfig,
      sponsor.secret(),
      receipts,
      server as unknown as NonNullable<
        ConstructorParameters<typeof ReviewSponsorshipService>[3]
      >,
    );

    await expect(
      service.submit(reviewer.publicKey(), {
        ...review,
        signedAuthorizationEntry: authorization.toXDR("base64"),
      }),
    ).resolves.toEqual({ reviewId: BigInt(1), transactionHash: sentHash, ledger: 120 });
    await expect(receipts.findById("1")).resolves.toMatchObject({
      id: "1",
      reviewerWalletAddress: reviewer.publicKey(),
      transactionHash: sentHash,
      ledger: 120,
    });
  });

  it("rejects an authorization for a different review before sponsoring it", async () => {
    const sponsor = Keypair.random();
    const reviewer = Keypair.random();
    const authorization = await signedReviewAuthorization({
      reviewer,
      rating: 1,
      message: "Different review.",
    });
    const server = {
      getAccount: vi.fn(),
      getLatestLedger: vi.fn(),
      simulateTransaction: vi.fn(),
      prepareTransaction: vi.fn(),
      sendTransaction: vi.fn(),
      pollTransaction: vi.fn(),
    };
    const service = new ReviewSponsorshipService(
      testStellarConfig,
      sponsor.secret(),
      createOffchainRepositories(createStore()).reviewReceipts,
      server as unknown as NonNullable<
        ConstructorParameters<typeof ReviewSponsorshipService>[3]
      >,
    );

    await expect(
      service.submit(reviewer.publicKey(), {
        rating: 5,
        message: "Expected review.",
        signedAuthorizationEntry: authorization.toXDR("base64"),
      }),
    ).rejects.toThrow(ReviewSponsorshipError);
    expect(server.getAccount).not.toHaveBeenCalled();
    expect(server.sendTransaction).not.toHaveBeenCalled();
  });
});
