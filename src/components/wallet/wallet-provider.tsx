"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { z } from "zod";

import type { StellarConfig } from "@/lib/stellar/config";
import { createFreighterAdapter } from "@/lib/stellar/freighter-adapter";

const balanceSchema = z.object({
  address: z.string(),
  xlm: z.string(),
  asset: z.object({
    code: z.string(),
    balance: z.string().nullable(),
    hasTrustline: z.boolean(),
  }),
});

const sessionSchema = z.discriminatedUnion("authenticated", [
  z.object({ authenticated: z.literal(false) }),
  z.object({
    authenticated: z.literal(true),
    address: z.string(),
    expiresAt: z.string(),
  }),
]);

const challengeSchema = z.object({ id: z.string(), message: z.string() });

export type WalletBalances = z.infer<typeof balanceSchema>;
export type WalletSession = z.infer<typeof sessionSchema>;

export interface WalletAdapter {
  connect(): Promise<{ address: string; networkPassphrase: string }>;
  restore(): Promise<{ address: string; networkPassphrase: string } | null>;
  signMessage(
    message: string,
    address: string,
    networkPassphrase: string,
  ): Promise<{ signature: string; signerAddress?: string }>;
  signTransaction(
    transactionXdr: string,
    address: string,
    networkPassphrase: string,
  ): Promise<{ signedTxXdr: string; signerAddress?: string }>;
  signAuthEntry(
    authEntryXdr: string,
    address: string,
    networkPassphrase: string,
  ): Promise<{ signedAuthEntry: string; signerAddress?: string }>;
  disconnect(): Promise<void>;
}

export interface WalletApi {
  readSession(): Promise<WalletSession>;
  createChallenge(address: string): Promise<{ id: string; message: string }>;
  createSession(challengeId: string, signature: string): Promise<WalletSession>;
  revokeSession(): Promise<void>;
  readBalances(address: string): Promise<WalletBalances>;
}

type WalletStatus = "checking" | "disconnected" | "connecting" | "connected";

interface WalletContextValue {
  status: WalletStatus;
  address: string | null;
  balances: WalletBalances | null;
  error: string | null;
  networkLabel: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  refreshBalances(): Promise<void>;
  signTransaction(
    transactionXdr: string,
  ): Promise<{ signedTxXdr: string; signerAddress?: string }>;
  signAuthEntry(
    authEntryXdr: string,
  ): Promise<{ signedAuthEntry: string; signerAddress?: string }>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = (await response.json()) as { error?: unknown };

  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "The wallet request failed.");
  }

  return data;
}

function createWalletApi(): WalletApi {
  return {
    async readSession() {
      return sessionSchema.parse(await requestJson("/api/wallet/session"));
    },
    async createChallenge(address) {
      return challengeSchema.parse(
        await requestJson("/api/wallet/challenge", {
          method: "POST",
          body: JSON.stringify({ address }),
        }),
      );
    },
    async createSession(challengeId, signature) {
      return sessionSchema.parse(
        await requestJson("/api/wallet/session", {
          method: "POST",
          body: JSON.stringify({ challengeId, signature }),
        }),
      );
    },
    async revokeSession() {
      await requestJson("/api/wallet/session", { method: "DELETE" });
    },
    async readBalances(address) {
      return balanceSchema.parse(
        await requestJson(`/api/stellar/balances?address=${encodeURIComponent(address)}`),
      );
    },
  };
}

function readableError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }
  return "Freighter could not complete the wallet request.";
}

export function WalletProvider({
  children,
  config,
  adapter: adapterOverride,
  api: apiOverride,
}: {
  children: React.ReactNode;
  config: StellarConfig;
  adapter?: WalletAdapter;
  api?: WalletApi;
}) {
  const adapter = useMemo(
    () => adapterOverride ?? createFreighterAdapter(config),
    [adapterOverride, config],
  );
  const api = useMemo(() => apiOverride ?? createWalletApi(), [apiOverride]);
  const [status, setStatus] = useState<WalletStatus>("checking");
  const [address, setAddress] = useState<string | null>(null);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [error, setError] = useState<string | null>(null);
  const networkLabel = config.network === "testnet" ? "Stellar Testnet" : "Stellar Mainnet";

  const clearWallet = useCallback(() => {
    setAddress(null);
    setBalances(null);
    setStatus("disconnected");
  }, []);

  const ensureExpectedNetwork = useCallback(
    (networkPassphrase: string) => {
      if (networkPassphrase !== config.networkPassphrase) {
        throw new Error(`Switch Freighter to ${networkLabel}, then try again.`);
      }
    },
    [config.networkPassphrase, networkLabel],
  );

  useEffect(() => {
    let active = true;

    async function restore() {
      try {
        const session = await api.readSession();
        if (!session.authenticated) {
          if (active) clearWallet();
          return;
        }

        const wallet = await adapter.restore();
        if (!wallet || wallet.address !== session.address) {
          await api.revokeSession();
          if (active) clearWallet();
          return;
        }

        ensureExpectedNetwork(wallet.networkPassphrase);
        const nextBalances = await api.readBalances(wallet.address);
        if (active) {
          setAddress(wallet.address);
          setBalances(nextBalances);
          setStatus("connected");
        }
      } catch (restoreError) {
        await api.revokeSession().catch(() => undefined);
        await adapter.disconnect().catch(() => undefined);
        if (active) {
          clearWallet();
          setError(readableError(restoreError));
        }
      }
    }

    void restore();
    return () => {
      active = false;
    };
  }, [adapter, api, clearWallet, ensureExpectedNetwork]);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);

    try {
      await api.revokeSession();
      const wallet = await adapter.connect();
      ensureExpectedNetwork(wallet.networkPassphrase);
      const challenge = await api.createChallenge(wallet.address);
      const signed = await adapter.signMessage(
        challenge.message,
        wallet.address,
        config.networkPassphrase,
      );

      if (signed.signerAddress && signed.signerAddress !== wallet.address) {
        throw new Error("Freighter signed with a different account. Please reconnect the intended wallet.");
      }

      const session = await api.createSession(challenge.id, signed.signature);
      if (!session.authenticated || session.address !== wallet.address) {
        throw new Error("The verified wallet session did not match the connected account.");
      }

      const nextBalances = await api.readBalances(wallet.address);
      setAddress(wallet.address);
      setBalances(nextBalances);
      setStatus("connected");
    } catch (connectError) {
      await api.revokeSession().catch(() => undefined);
      await adapter.disconnect().catch(() => undefined);
      clearWallet();
      setError(readableError(connectError));
    }
  }, [adapter, api, clearWallet, config.networkPassphrase, ensureExpectedNetwork]);

  const disconnect = useCallback(async () => {
    setError(null);
    await Promise.allSettled([api.revokeSession(), adapter.disconnect()]);
    clearWallet();
  }, [adapter, api, clearWallet]);

  const refreshBalances = useCallback(async () => {
    if (!address) return;

    try {
      setBalances(await api.readBalances(address));
      setError(null);
    } catch (refreshError) {
      setError(readableError(refreshError));
    }
  }, [address, api]);

  const signTransaction = useCallback(
    async (transactionXdr: string) => {
      if (!address || status !== "connected") {
        throw new Error("Connect and authenticate Freighter before signing a transaction.");
      }

      const signed = await adapter.signTransaction(
        transactionXdr,
        address,
        config.networkPassphrase,
      );
      if (signed.signerAddress && signed.signerAddress !== address) {
        throw new Error("Freighter signed with a different account. Please reconnect the intended wallet.");
      }
      return signed;
    },
    [adapter, address, config.networkPassphrase, status],
  );

  const signAuthEntry = useCallback(
    async (authEntryXdr: string) => {
      if (!address || status !== "connected") {
        throw new Error("Connect and authenticate Freighter before approving redemption.");
      }

      const signed = await adapter.signAuthEntry(
        authEntryXdr,
        address,
        config.networkPassphrase,
      );
      if (signed.signerAddress && signed.signerAddress !== address) {
        throw new Error("Freighter signed with a different account. Please reconnect the intended wallet.");
      }
      return signed;
    },
    [adapter, address, config.networkPassphrase, status],
  );

  return (
    <WalletContext.Provider
      value={{
        status,
        address,
        balances,
        error,
        networkLabel,
        connect,
        disconnect,
        refreshBalances,
        signAuthEntry,
        signTransaction,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider.");
  return context;
}
