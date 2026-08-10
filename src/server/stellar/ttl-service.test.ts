import { describe, expect, it } from "vitest";
import { scValToNative } from "@stellar/stellar-sdk";

import {
  createMetadataLedgerKeys,
  createRedemptionRegistryLedgerKeys,
  createReviewLedgerKeys,
  createWrenPassLedgerKeys,
} from "@/server/stellar/ttl-service";
import { testCustomerAddress, testStellarConfig } from "@/test/fixtures/customer";

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

  it("supports contracts beyond the former 2,000-entry limit", () => {
    const keys = createWrenPassLedgerKeys(
      testStellarConfig.wrenPassContractId,
      BigInt(2_001),
      BigInt(1),
    );

    expect(keys).toHaveLength(2_003);
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

describe("Metadata TTL ledger keys", () => {
  it("includes profiles, campaign indexes, and campaign records", () => {
    const keys = createMetadataLedgerKeys(
      testStellarConfig.wrenPassContractId,
      [{ merchant: testCustomerAddress, campaignCount: BigInt(1) }],
      [BigInt(1)],
    );

    expect(keys).toHaveLength(6);
    expect(scValToNative(keys[1]!.contractData().key())).toEqual([
      "Merchant",
      testCustomerAddress,
    ]);
    expect(scValToNative(keys[3]!.contractData().key())).toEqual([
      "MerchantCampaign",
      testCustomerAddress,
      BigInt(0),
    ]);
    expect(scValToNative(keys[4]!.contractData().key())).toEqual(["Campaign", BigInt(1)]);
  });

  it("rejects invalid campaign identifiers", () => {
    expect(() => createMetadataLedgerKeys(
      testStellarConfig.wrenPassContractId,
      [],
      [BigInt(0)],
    )).toThrow("positive");
  });

  it("tracks profile-only merchants without inventing a campaign-count key", () => {
    const keys = createMetadataLedgerKeys(
      testStellarConfig.metadataContractId,
      [{ merchant: testCustomerAddress, campaignCount: BigInt(0) }],
      [],
    );

    expect(keys).toHaveLength(2);
    expect(scValToNative(keys[1]!.contractData().key())).toEqual([
      "Merchant",
      testCustomerAddress,
    ]);
  });
});

describe("Redemption registry TTL ledger keys", () => {
  it("tracks only the durable contract instance", () => {
    const keys = createRedemptionRegistryLedgerKeys(
      testStellarConfig.redemptionContractId,
    );

    expect(keys).toHaveLength(1);
    expect(keys[0]?.contractData().key().switch().name).toBe(
      "scvLedgerKeyContractInstance",
    );
  });
});
