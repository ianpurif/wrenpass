import { nativeToScVal, rpc, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import {
  decodeCustomerActivity,
  toRpcEventContractId,
} from "@/server/stellar/customer-chain-reader";
import { testCustomerAddress, testRecipientAddress } from "@/test/fixtures/customer";

function mapValue(values: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    Object.entries(values).map(
      ([key, value]) =>
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val: value }),
    ),
  );
}

function event(
  name: string,
  actor: string,
  value: xdr.ScVal,
  id: string,
): rpc.Api.EventResponse {
  return {
    id,
    type: "contract",
    ledger: 100,
    ledgerClosedAt: "2026-08-09T08:00:00.000Z",
    transactionIndex: 1,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: "a".repeat(64),
    topic: [
      xdr.ScVal.scvSymbol(name),
      nativeToScVal(BigInt(1), { type: "u64" }),
      nativeToScVal(BigInt(2), { type: "u64" }),
      nativeToScVal(actor, { type: "address" }),
    ],
    value,
  };
}

describe("decodeCustomerActivity", () => {
  it("converts a StrKey contract address to the hex ID required by the installed RPC client", () => {
    expect(
      toRpcEventContractId("CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D"),
    ).toBe("0b546903c160a0dab0fd7c9412923fb67b55f2d601530256f428a0eb80079bff");
  });

  it("decodes purchases and outgoing gifts for the authenticated wallet", () => {
    const events = [
      event(
        "pass_purchased",
        testCustomerAddress,
        mapValue({ total: nativeToScVal(BigInt(50_000_000), { type: "i128" }) }),
        "purchase",
      ),
      event(
        "pass_gifted",
        testCustomerAddress,
        mapValue({ recipient: nativeToScVal(testRecipientAddress, { type: "address" }) }),
        "gift",
      ),
    ];

    expect(decodeCustomerActivity(events, testCustomerAddress)).toEqual([
      expect.objectContaining({ id: "purchase", kind: "Purchased", amount: "50000000" }),
      expect.objectContaining({ id: "gift", kind: "Gifted", counterparty: testRecipientAddress }),
    ]);
  });

  it("classifies a gift to the wallet as received", () => {
    const events = [
      event(
        "pass_gifted",
        testRecipientAddress,
        mapValue({ recipient: nativeToScVal(testCustomerAddress, { type: "address" }) }),
        "received",
      ),
    ];

    expect(decodeCustomerActivity(events, testCustomerAddress)).toEqual([
      expect.objectContaining({ id: "received", kind: "Received", counterparty: testRecipientAddress }),
    ]);
  });
});
