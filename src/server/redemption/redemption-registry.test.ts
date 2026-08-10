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

import {
  RedemptionRegistryError,
  StellarRedemptionRegistry,
} from "@/server/redemption/redemption-registry";
import { testStellarConfig } from "@/test/fixtures/customer";

async function signedRequestAuthorization(input: {
  merchant: Keypair;
  owner: string;
  passId?: bigint;
  serializedTransaction: string;
  expiresAtLedger: number;
}) {
  const invocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(
          testStellarConfig.redemptionContractId,
        ).toScAddress(),
        functionName: "create_request",
        args: [
          nativeToScVal(input.merchant.publicKey(), { type: "address" }),
          nativeToScVal(input.owner, { type: "address" }),
          nativeToScVal(input.passId ?? BigInt(1), { type: "u64" }),
          nativeToScVal(input.serializedTransaction, { type: "string" }),
          nativeToScVal(input.expiresAtLedger, { type: "u32" }),
        ],
      }),
    ),
    subInvocations: [],
  });
  return authorizeInvocation({
    signer: input.merchant,
    validUntilLedgerSeq: 150,
    invocation,
    networkPassphrase: testStellarConfig.networkPassphrase,
  });
}

describe("StellarRedemptionRegistry", () => {
  it("sponsors only the exact signed request authorization", async () => {
    const sponsor = Keypair.random();
    const merchant = Keypair.random();
    const owner = Keypair.random().publicKey();
    const request = {
      merchant: merchant.publicKey(),
      owner,
      passId: BigInt(1),
      serializedTransaction: "merchant-authorized-redemption",
      expiresAtLedger: 140,
    };
    const authorization = await signedRequestAuthorization({
      merchant,
      owner,
      passId: request.passId,
      serializedTransaction: request.serializedTransaction,
      expiresAtLedger: request.expiresAtLedger,
    });
    const sentHash = "b".repeat(64);
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
      }) as rpc.Api.GetSuccessfulTransactionResponse),
    };
    const registry = new StellarRedemptionRegistry(
      testStellarConfig,
      sponsor.secret(),
      server as unknown as NonNullable<
        ConstructorParameters<typeof StellarRedemptionRegistry>[2]
      >,
    );

    await expect(registry.submit({
      ...request,
      signedAuthorizationEntry: authorization.toXDR("base64"),
    })).resolves.toEqual({ transactionHash: sentHash, ledger: 120 });
  });

  it("rejects a signature for another pass before using sponsor funds", async () => {
    const sponsor = Keypair.random();
    const merchant = Keypair.random();
    const owner = Keypair.random().publicKey();
    const authorization = await signedRequestAuthorization({
      merchant,
      owner,
      passId: BigInt(2),
      serializedTransaction: "different-redemption",
      expiresAtLedger: 140,
    });
    const server = {
      getAccount: vi.fn(),
      getLatestLedger: vi.fn(),
      simulateTransaction: vi.fn(),
      prepareTransaction: vi.fn(),
      sendTransaction: vi.fn(),
      pollTransaction: vi.fn(),
    };
    const registry = new StellarRedemptionRegistry(
      testStellarConfig,
      sponsor.secret(),
      server as unknown as NonNullable<
        ConstructorParameters<typeof StellarRedemptionRegistry>[2]
      >,
    );

    await expect(registry.submit({
      merchant: merchant.publicKey(),
      owner,
      passId: BigInt(1),
      serializedTransaction: "expected-redemption",
      expiresAtLedger: 140,
      signedAuthorizationEntry: authorization.toXDR("base64"),
    })).rejects.toThrow(RedemptionRegistryError);
    expect(server.getAccount).not.toHaveBeenCalled();
    expect(server.sendTransaction).not.toHaveBeenCalled();
  });
});
