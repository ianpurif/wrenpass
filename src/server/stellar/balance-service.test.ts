// @vitest-environment node

import { Keypair, Networks } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  StellarBalanceService,
  StellarNetworkMismatchError,
  StellarRpcUnavailableError,
  type StellarLedgerGateway,
} from "@/server/stellar/balance-service";

const address = Keypair.random().publicKey();

function createGateway(overrides: Partial<StellarLedgerGateway> = {}): StellarLedgerGateway {
  return {
    getNetworkPassphrase: vi.fn().mockResolvedValue(Networks.TESTNET),
    readAccountBalance: vi.fn().mockResolvedValue(BigInt(125_000_000)),
    readTrustlineBalance: vi.fn().mockResolvedValue(BigInt(60_000_000)),
    ...overrides,
  };
}

describe("StellarBalanceService", () => {
  it("returns integer-safe XLM and asset balances", async () => {
    const service = new StellarBalanceService(
      { assetCode: "USDC", assetIssuer: Keypair.random().publicKey(), networkPassphrase: Networks.TESTNET },
      createGateway(),
    );

    await expect(service.getBalances(address)).resolves.toEqual({
      address,
      xlm: "12.5000000",
      asset: { code: "USDC", balance: "6.0000000", hasTrustline: true },
    });
  });

  it("reports a missing asset trustline without inventing a balance", async () => {
    const service = new StellarBalanceService(
      { assetCode: "USDC", assetIssuer: Keypair.random().publicKey(), networkPassphrase: Networks.TESTNET },
      createGateway({ readTrustlineBalance: vi.fn().mockResolvedValue(null) }),
    );

    await expect(service.getBalances(address)).resolves.toMatchObject({
      asset: { balance: null, hasTrustline: false },
    });
  });

  it("rejects malformed addresses and a mismatched RPC network", async () => {
    const gateway = createGateway({
      getNetworkPassphrase: vi.fn().mockResolvedValue(Networks.PUBLIC),
    });
    const service = new StellarBalanceService(
      { assetCode: "USDC", assetIssuer: Keypair.random().publicKey(), networkPassphrase: Networks.TESTNET },
      gateway,
    );

    await expect(service.getBalances("invalid")).rejects.toThrow(/address/i);
    await expect(service.getBalances(address)).rejects.toBeInstanceOf(StellarNetworkMismatchError);
  });

  it("surfaces RPC failures as a stable application error", async () => {
    const service = new StellarBalanceService(
      { assetCode: "USDC", assetIssuer: Keypair.random().publicKey(), networkPassphrase: Networks.TESTNET },
      createGateway({ getNetworkPassphrase: vi.fn().mockRejectedValue(new Error("offline")) }),
    );

    await expect(service.getBalances(address)).rejects.toBeInstanceOf(StellarRpcUnavailableError);
  });
});
