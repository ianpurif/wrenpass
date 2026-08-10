// @vitest-environment node

import { Asset, Keypair, Networks } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { ContractConfig } from "@/generated/wrenpass-contract/src";
import type { StellarConfig } from "@/lib/stellar/config";
import {
  assertPurchaseDistributionReady,
  type PurchaseReadinessGateway,
} from "@/server/stellar/purchase-readiness";

const issuer = Keypair.random().publicKey();
const platform = Keypair.random().publicKey();
const config: StellarConfig = {
  network: "testnet",
  networkPassphrase: Networks.TESTNET,
  rpcUrl: "https://soroban-testnet.stellar.org",
  assetCode: "USDC",
  assetIssuer: issuer,
  assetContractId: new Asset("USDC", issuer).contractId(Networks.TESTNET),
  wrenPassContractId: Keypair.random().publicKey().replace("G", "C"),
  reviewContractId: Keypair.random().publicKey().replace("G", "C"),
};
const contractConfig: ContractConfig = {
  payment_asset: config.assetContractId,
  platform,
};

function createGateway(
  overrides: Partial<PurchaseReadinessGateway> = {},
): PurchaseReadinessGateway {
  return {
    readAccountBalance: vi.fn().mockResolvedValue(BigInt(100_000_000)),
    readTrustlineBalance: vi.fn().mockResolvedValue(BigInt(0)),
    ...overrides,
  };
}

describe("assertPurchaseDistributionReady", () => {
  it("accepts a funded platform recipient with the configured asset trustline", async () => {
    await expect(
      assertPurchaseDistributionReady(config, contractConfig, createGateway()),
    ).resolves.toBeUndefined();
  });

  it("rejects the missing platform trustline that would break fee distribution", async () => {
    const gateway = createGateway({
      readTrustlineBalance: vi.fn().mockResolvedValue(null),
    });

    await expect(
      assertPurchaseDistributionReady(config, contractConfig, gateway),
    ).rejects.toThrow(/platform fee account is missing the USDC trustline/i);
  });

  it("rejects a mismatched contract payment asset", async () => {
    const differentIssuer = Keypair.random().publicKey();

    await expect(
      assertPurchaseDistributionReady(
        config,
        {
          ...contractConfig,
          payment_asset: new Asset("USDC", differentIssuer).contractId(Networks.TESTNET),
        },
        createGateway(),
      ),
    ).rejects.toThrow(/payment asset does not match/i);
  });

  it("does not require an issuer account to trust its own asset", async () => {
    const gateway = createGateway();

    await expect(
      assertPurchaseDistributionReady(
        config,
        { ...contractConfig, platform: issuer },
        gateway,
      ),
    ).resolves.toBeUndefined();
    expect(gateway.readTrustlineBalance).not.toHaveBeenCalled();
  });
});
