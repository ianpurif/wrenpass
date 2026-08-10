import type { Campaign, Pass } from "@/generated/wrenpass-contract/src";
import type { RedemptionRequest } from "@/generated/redemptions-contract/src";
import { encodeRedemptionQrPayload } from "@/features/redemption/qr";
import {
  RedemptionService,
  RedemptionServiceError,
} from "@/server/redemption/redemption-service";
import {
  testCustomerAddress as merchant,
  testRecipientAddress as owner,
  testStellarConfig,
} from "@/test/fixtures/customer";
import { describe, expect, it, vi } from "vitest";

function pass(status: Pass["status"] = { tag: "Active", values: undefined }): Pass {
  return {
    id: BigInt(1),
    campaign_id: BigInt(1),
    owner,
    status,
    purchased_at: BigInt(1_786_261_200),
    purchase_amounts: {
      total: BigInt(50_000_000),
      merchant_release: BigInt(37_500_000),
      protected_reserve: BigInt(10_000_000),
      platform_fee: BigInt(2_500_000),
    },
  };
}

function campaign(): Campaign {
  return {
    cancellation_funds: BigInt(0),
    cancellation_shortfall: BigInt(0),
    created_at: BigInt(1_786_261_100),
    expires_at: BigInt(1_794_121_200),
    financial_rules: { merchant_bps: 7_500, reserve_bps: 2_000, platform_fee_bps: 500 },
    id: BigInt(1),
    max_supply: 100,
    merchant,
    merchant_released: BigInt(37_500_000),
    pass_price: BigInt(50_000_000),
    payment_asset: testStellarConfig.assetContractId,
    platform: owner,
    platform_fees_paid: BigInt(2_500_000),
    protected_funds: BigInt(10_000_000),
    redeemed: 0,
    refunded: 0,
    service_value: BigInt(60_000_000),
    sold: 1,
    status: { tag: "Active", values: undefined },
  };
}

const qrPayload = encodeRedemptionQrPayload({
  network: "testnet",
  contractId: testStellarConfig.wrenPassContractId,
  passId: "1",
});

function setup(passValue: Pass = pass()) {
  const chain = {
    findPass: vi.fn().mockResolvedValue(passValue),
    findCampaign: vi.fn().mockResolvedValue(campaign()),
  };
  const verifier = { verifyMerchantAuthorization: vi.fn().mockResolvedValue(undefined) };
  let storedRequest: RedemptionRequest | null = null;
  const registry = {
    prepare: vi.fn().mockResolvedValue({
      authorizationEntry: "unsigned-registry-authorization",
      expiresAtLedger: 1_234_600,
    }),
    submit: vi.fn(async (input: {
      merchant: string;
      owner: string;
      passId: bigint;
      serializedTransaction: string;
      expiresAtLedger: number;
    }) => {
      storedRequest = {
        campaign_id: BigInt(1),
        created_at: BigInt(1_786_266_000),
        expires_at_ledger: input.expiresAtLedger,
        merchant: input.merchant,
        owner: input.owner,
        pass_id: input.passId,
        serialized_transaction: input.serializedTransaction,
      };
      return { transactionHash: "a".repeat(64), ledger: 1_234_501 };
    }),
    findByOwner: vi.fn(async (walletAddress: string) =>
      storedRequest?.owner === walletAddress ? [storedRequest] : [],
    ),
    findByPass: vi.fn(async (passId: bigint) =>
      storedRequest?.pass_id === passId ? storedRequest : null,
    ),
  };
  const service = new RedemptionService(
    testStellarConfig,
    registry,
    chain,
    verifier,
    () => new Date("2026-08-09T10:00:00.000Z"),
  );
  return { chain, registry, service, verifier };
}

describe("RedemptionService", () => {
  it("allows only the campaign merchant to validate an active pass QR", async () => {
    const { service } = setup();
    await expect(service.validateMerchantScan(merchant, qrPayload)).resolves.toMatchObject({
      passId: "1",
      campaignId: "1",
      merchant,
      owner,
    });
    await expect(service.validateMerchantScan(owner, qrPayload)).rejects.toEqual(
      new RedemptionServiceError("Only this campaign's merchant can start redemption."),
    );
  });

  it("rejects a copied QR once the pass is no longer active", async () => {
    const { service } = setup(pass({ tag: "Redeemed", values: undefined }));
    await expect(service.validateMerchantScan(merchant, qrPayload)).rejects.toThrow(
      "Only an active pass can be redeemed.",
    );
  });

  it("prepares and publishes a request only after the redemption authorization is verified", async () => {
    const { registry, service, verifier } = setup();
    await expect(service.prepareRequest(merchant, {
      qrPayload,
      serializedTransaction: "signed-merchant-auth",
      expiresAtLedger: 1_234_567,
    })).resolves.toEqual({
      authorizationEntry: "unsigned-registry-authorization",
      expiresAtLedger: 1_234_600,
    });
    const request = await service.createRequest(merchant, {
      qrPayload,
      serializedTransaction: "signed-merchant-auth",
      expiresAtLedger: 1_234_567,
      signedAuthorizationEntry: "signed-registry-auth",
    });

    expect(verifier.verifyMerchantAuthorization).toHaveBeenCalledWith({
      serializedTransaction: "signed-merchant-auth",
      passId: BigInt(1),
      merchant,
      owner,
      expiresAtLedger: 1_234_567,
    });
    expect(registry.submit).toHaveBeenCalledWith({
      merchant,
      owner,
      passId: BigInt(1),
      serializedTransaction: "signed-merchant-auth",
      expiresAtLedger: 1_234_567,
      signedAuthorizationEntry: "signed-registry-auth",
    });
    expect(await service.getPendingRequests(owner)).toEqual([request]);
  });

  it("does not expose another wallet's pending request", async () => {
    const { service } = setup();
    await service.createRequest(merchant, {
      qrPayload,
      serializedTransaction: "signed-merchant-auth",
      expiresAtLedger: 1_234_567,
      signedAuthorizationEntry: "signed-registry-auth",
    });
    await expect(service.getPendingRequests(merchant)).resolves.toEqual([]);
  });
});
