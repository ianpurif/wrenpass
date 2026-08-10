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

import { assertRedemptionRequestAuthorization } from "@/features/redemption/request-authorization";
import { StellarRedemptionRequestWriter } from "@/lib/stellar/redemption-request-client";
import { testStellarConfig } from "@/test/fixtures/customer";

describe("StellarRedemptionRequestWriter", () => {
  it("signs only the exact registry request prepared for the merchant", async () => {
    const merchant = Keypair.random();
    const owner = Keypair.random().publicKey();
    const serializedTransaction = "merchant-authorized-redemption";
    const expiresAtLedger = 1_060;
    const invocation = new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: Address.fromString(
            testStellarConfig.redemptionContractId,
          ).toScAddress(),
          functionName: "create_request",
          args: [
            nativeToScVal(merchant.publicKey(), { type: "address" }),
            nativeToScVal(owner, { type: "address" }),
            nativeToScVal(BigInt(1), { type: "u64" }),
            nativeToScVal(serializedTransaction, { type: "string" }),
            nativeToScVal(expiresAtLedger, { type: "u32" }),
          ],
        }),
      ),
      subInvocations: [],
    });
    const preparedAuthorization = await authorizeInvocation({
      signer: merchant,
      validUntilLedgerSeq: 1_080,
      invocation,
      networkPassphrase: testStellarConfig.networkPassphrase,
    });
    const submitCreate = vi.fn(async (input: {
      signedAuthorizationEntry: string;
    }) => ({
      id: "1",
      passId: "1",
      campaignId: "1",
      merchant: merchant.publicKey(),
      owner,
      serializedTransaction,
      expiresAtLedger,
      createdAt: "2026-08-10T00:00:00.000Z",
      expiresAt: "2026-11-08T03:00:00.000Z",
      ...input,
    }));
    const writer = new StellarRedemptionRequestWriter(testStellarConfig, {
      prepareCreate: vi.fn(async () => ({
        authorizationEntry: preparedAuthorization.toXDR("base64"),
        expiresAtLedger: 1_100,
      })),
      submitCreate,
    });

    await writer.publish({
      qrPayload: "wrenpass-qr",
      serializedTransaction,
      expiresAtLedger,
      passId: BigInt(1),
      merchant: merchant.publicKey(),
      owner,
      signAuthEntry: vi.fn(async (preimageXdr) => ({
        signedAuthEntry: merchant
          .sign(hash(Buffer.from(preimageXdr, "base64")))
          .toString("base64"),
        signerAddress: merchant.publicKey(),
      })),
    });

    const submission = submitCreate.mock.calls[0][0];
    const signedAuthorization = xdr.SorobanAuthorizationEntry.fromXDR(
      submission.signedAuthorizationEntry,
      "base64",
    );
    assertRedemptionRequestAuthorization(signedAuthorization, {
      contractId: testStellarConfig.redemptionContractId,
      merchant: merchant.publicKey(),
      owner,
      passId: BigInt(1),
      serializedTransaction,
      expiresAtLedger,
    });
    expect(
      signedAuthorization.credentials().address().signatureExpirationLedger(),
    ).toBe(1_100);
    expect(
      signedAuthorization.credentials().address().signature().switch().name,
    ).not.toBe("scvVoid");
  });
});
