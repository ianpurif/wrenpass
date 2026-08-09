import "server-only";

import { StrKey } from "@stellar/stellar-sdk";

export interface StellarLedgerGateway {
  getNetworkPassphrase(): Promise<string>;
  readAccountBalance(address: string): Promise<bigint | null>;
  readTrustlineBalance(
    address: string,
    asset: { code: string; issuer: string },
  ): Promise<bigint | null>;
}

interface BalanceServiceConfig {
  networkPassphrase: string;
  assetCode: string;
  assetIssuer: string;
}

export interface StellarBalances {
  address: string;
  xlm: string;
  asset: {
    code: string;
    balance: string | null;
    hasTrustline: boolean;
  };
}

export class StellarNetworkMismatchError extends Error {
  constructor() {
    super("The configured RPC endpoint is connected to a different Stellar network.");
    this.name = "StellarNetworkMismatchError";
  }
}

export class StellarRpcUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Stellar RPC is temporarily unavailable.", { cause });
    this.name = "StellarRpcUnavailableError";
  }
}

export class StellarAccountNotFoundError extends Error {
  constructor() {
    super("This Stellar account is not funded on the configured network.");
    this.name = "StellarAccountNotFoundError";
  }
}

export function formatStellarAmount(amount: bigint): string {
  const zero = BigInt(0);
  const scale = BigInt(10_000_000);
  const sign = amount < zero ? "-" : "";
  const absolute = amount < zero ? -amount : amount;
  return `${sign}${absolute / scale}.${(absolute % scale).toString().padStart(7, "0")}`;
}

export class StellarBalanceService {
  constructor(
    private readonly config: BalanceServiceConfig,
    private readonly gateway: StellarLedgerGateway,
  ) {}

  async getBalances(address: string): Promise<StellarBalances> {
    if (!StrKey.isValidEd25519PublicKey(address)) {
      throw new Error("A valid Stellar account address is required.");
    }

    let actualPassphrase: string;
    try {
      actualPassphrase = await this.gateway.getNetworkPassphrase();
    } catch (error) {
      throw new StellarRpcUnavailableError(error);
    }

    if (actualPassphrase !== this.config.networkPassphrase) {
      throw new StellarNetworkMismatchError();
    }

    let xlmBalance: bigint | null;
    let assetBalance: bigint | null;
    try {
      [xlmBalance, assetBalance] = await Promise.all([
        this.gateway.readAccountBalance(address),
        this.gateway.readTrustlineBalance(address, {
          code: this.config.assetCode,
          issuer: this.config.assetIssuer,
        }),
      ]);
    } catch (error) {
      throw new StellarRpcUnavailableError(error);
    }

    if (xlmBalance === null) {
      throw new StellarAccountNotFoundError();
    }

    return {
      address,
      xlm: formatStellarAmount(xlmBalance),
      asset: {
        code: this.config.assetCode,
        balance: assetBalance === null ? null : formatStellarAmount(assetBalance),
        hasTrustline: assetBalance !== null,
      },
    };
  }
}
