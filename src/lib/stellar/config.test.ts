// @vitest-environment node

import { Asset, Keypair, Networks } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { parseStellarConfig } from "@/lib/stellar/config";

function validConfig(network: "testnet" | "mainnet" = "testnet") {
  const issuer = Keypair.random().publicKey();
  const passphrase = network === "testnet" ? Networks.TESTNET : Networks.PUBLIC;

  return {
    NEXT_PUBLIC_STELLAR_NETWORK: network,
    NEXT_PUBLIC_STELLAR_RPC_URL:
      network === "testnet"
        ? "https://soroban-testnet.stellar.org"
        : "https://mainnet.sorobanrpc.com",
    NEXT_PUBLIC_STELLAR_ASSET_CODE: "USDC",
    NEXT_PUBLIC_STELLAR_ASSET_ISSUER: issuer,
    NEXT_PUBLIC_STELLAR_ASSET_CONTRACT_ID: new Asset("USDC", issuer).contractId(passphrase),
  };
}

describe("parseStellarConfig", () => {
  it("derives the correct passphrase for Testnet and Mainnet", () => {
    expect(parseStellarConfig(validConfig("testnet")).networkPassphrase).toBe(Networks.TESTNET);
    expect(parseStellarConfig(validConfig("mainnet")).networkPassphrase).toBe(Networks.PUBLIC);
  });

  it("rejects an asset contract that does not match the configured asset", () => {
    const input = validConfig();
    input.NEXT_PUBLIC_STELLAR_ASSET_CONTRACT_ID = new Asset(
      "OTHER",
      input.NEXT_PUBLIC_STELLAR_ASSET_ISSUER,
    ).contractId(Networks.TESTNET);

    expect(() => parseStellarConfig(input)).toThrow(/does not match/i);
  });

  it("rejects malformed addresses and insecure remote RPC URLs", () => {
    expect(() =>
      parseStellarConfig({
        ...validConfig(),
        NEXT_PUBLIC_STELLAR_ASSET_ISSUER: "not-an-address",
      }),
    ).toThrow(/issuer/i);

    expect(() =>
      parseStellarConfig({
        ...validConfig(),
        NEXT_PUBLIC_STELLAR_RPC_URL: "http://rpc.example.com",
      }),
    ).toThrow(/RPC/i);
  });
});
