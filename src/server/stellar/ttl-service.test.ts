import { describe, expect, it } from "vitest";

import {
  createReviewLedgerKeys,
  createWrenPassLedgerKeys,
} from "@/server/stellar/ttl-service";
import { testStellarConfig } from "@/test/fixtures/customer";

describe("WrenPass TTL ledger keys", () => {
  it("includes the contract instance and every campaign and pass entry", () => {
    const keys = createWrenPassLedgerKeys(
      testStellarConfig.wrenPassContractId,
      BigInt(1),
      BigInt(1),
    );

    expect(keys).toHaveLength(3);
    expect(keys[1]?.contractData().key().toXDR("base64")).toBe(
      "AAAAEAAAAAEAAAACAAAADwAAAAhDYW1wYWlnbgAAAAUAAAAAAAAAAQ==",
    );
    expect(keys[2]?.contractData().key().toXDR("base64")).toBe(
      "AAAAEAAAAAEAAAACAAAADwAAAARQYXNzAAAABQAAAAAAAAAB",
    );
  });

  it("rejects an unbounded direct TTL scan", () => {
    expect(() =>
      createWrenPassLedgerKeys(
        testStellarConfig.wrenPassContractId,
        BigInt(2_001),
        BigInt(0),
      ),
    ).toThrow("safe entry limit");
  });
});

describe("Review TTL ledger keys", () => {
  it("includes the review contract instance and every review entry", () => {
    const keys = createReviewLedgerKeys(testStellarConfig.reviewContractId, BigInt(2));

    expect(keys).toHaveLength(3);
    expect(keys[1]?.contractData().key().toXDR("base64")).toBe(
      "AAAAEAAAAAEAAAACAAAADwAAAAZSZXZpZXcAAAAAAAUAAAAAAAAAAQ==",
    );
    expect(keys[2]?.contractData().key().toXDR("base64")).toBe(
      "AAAAEAAAAAEAAAACAAAADwAAAAZSZXZpZXcAAAAAAAUAAAAAAAAAAg==",
    );
  });
});
