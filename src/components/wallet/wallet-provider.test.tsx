import { Networks } from "@stellar/stellar-sdk";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { StellarConfig } from "@/lib/stellar/config";
import { WalletButton } from "@/components/wallet/wallet-button";
import {
  WalletProvider,
  type WalletApi,
  type WalletAdapter,
} from "@/components/wallet/wallet-provider";

const address = "GCLNZP3WX3GG4D2HC3L2VVXNYBSVHO2OPGGTDQ4YGBQOUXHHTM3FSBNH";
const config: StellarConfig = {
  network: "testnet",
  networkPassphrase: Networks.TESTNET,
  rpcUrl: "https://soroban-testnet.stellar.org",
  assetCode: "USDC",
  assetIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  assetContractId: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  wrenPassContractId: "CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D",
};

function createAdapter(overrides: Partial<WalletAdapter> = {}): WalletAdapter {
  return {
    connect: vi.fn().mockResolvedValue({ address, networkPassphrase: Networks.TESTNET }),
    restore: vi.fn().mockResolvedValue(null),
    signMessage: vi.fn().mockResolvedValue({ signature: "signed", signerAddress: address }),
    signTransaction: vi.fn().mockResolvedValue({
      signedTxXdr: "signed-transaction",
      signerAddress: address,
    }),
    signAuthEntry: vi.fn().mockResolvedValue({
      signedAuthEntry: "signed-auth-entry",
      signerAddress: address,
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createApi(overrides: Partial<WalletApi> = {}): WalletApi {
  return {
    readSession: vi.fn().mockResolvedValue({ authenticated: false }),
    createChallenge: vi.fn().mockResolvedValue({ id: "challenge", message: "Sign in" }),
    createSession: vi
      .fn()
      .mockResolvedValue({ authenticated: true, address, expiresAt: "2026-08-10T00:00:00Z" }),
    revokeSession: vi.fn().mockResolvedValue(undefined),
    readBalances: vi.fn().mockResolvedValue({
      address,
      xlm: "12.5000000",
      asset: { code: "USDC", balance: "6.0000000", hasTrustline: true },
    }),
    ...overrides,
  };
}

function renderWallet(adapter: WalletAdapter, api: WalletApi) {
  return render(
    <WalletProvider config={config} adapter={adapter} api={api}>
      <WalletButton />
    </WalletProvider>,
  );
}

describe("WalletProvider", () => {
  it("connects Freighter, establishes a signed session, and displays balances", async () => {
    const user = userEvent.setup();
    const adapter = createAdapter();
    const api = createApi();
    renderWallet(adapter, api);

    await user.click(await screen.findByRole("button", { name: "Connect Freighter" }));

    const walletMenuButton = await screen.findByRole("button", { name: /Open wallet menu/i });
    expect(walletMenuButton).toHaveTextContent(
      `${address.slice(0, 7)}...${address.slice(-7)}`,
    );
    const revokeCallsAfterConnect = vi.mocked(api.revokeSession).mock.calls.length;
    await user.click(walletMenuButton);
    expect(screen.getByRole("dialog", { name: "Wallet details" })).toBeVisible();
    const balanceRegion = screen.getByRole("region", { name: "Wallet balances" });
    expect(balanceRegion).toHaveTextContent("12.5000000 XLM");
    expect(balanceRegion).toHaveTextContent("6.0000000 USDC");
    expect(screen.getByRole("link", { name: "Business Profile" })).toHaveAttribute("href", "/merchant/business-identity");
    const copyAddressButton = screen.getByRole("button", { name: "Copy full wallet address" });
    expect(copyAddressButton).toHaveTextContent(`${address.slice(0, 7)}...${address.slice(-7)}`);
    await user.click(copyAddressButton);
    expect(copyAddressButton).toHaveTextContent("Copied");
    expect(await navigator.clipboard.readText()).toBe(address);
    expect(api.createChallenge).toHaveBeenCalledWith(address);
    expect(adapter.signMessage).toHaveBeenCalledWith("Sign in", address, Networks.TESTNET);

    expect(api.revokeSession).toHaveBeenCalledTimes(revokeCallsAfterConnect);
    await user.click(screen.getByRole("button", { name: "Disconnect Wallet" }));
    expect(await screen.findByRole("button", { name: "Connect Freighter" })).toBeInTheDocument();
    expect(api.revokeSession).toHaveBeenCalled();
    expect(adapter.disconnect).toHaveBeenCalled();
  });

  it("restores only when the server session and active wallet agree", async () => {
    const adapter = createAdapter({
      restore: vi.fn().mockResolvedValue({ address, networkPassphrase: Networks.TESTNET }),
    });
    const api = createApi({
      readSession: vi
        .fn()
        .mockResolvedValue({ authenticated: true, address, expiresAt: "2026-08-10T00:00:00Z" }),
    });
    renderWallet(adapter, api);

    expect(await screen.findByRole("button", { name: /Open wallet menu/i })).toBeInTheDocument();
    expect(api.readBalances).toHaveBeenCalledWith(address);
  });

  it("rejects a wallet on the wrong network before requesting a challenge", async () => {
    const user = userEvent.setup();
    const adapter = createAdapter({
      connect: vi.fn().mockResolvedValue({ address, networkPassphrase: Networks.PUBLIC }),
    });
    const api = createApi();
    renderWallet(adapter, api);

    await user.click(await screen.findByRole("button", { name: "Connect Freighter" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/switch freighter to stellar testnet/i);
    expect(api.createChallenge).not.toHaveBeenCalled();
    await waitFor(() => expect(adapter.disconnect).toHaveBeenCalled());
  });

  it("shows the useful message from a structured wallet error", async () => {
    const user = userEvent.setup();
    const adapter = createAdapter({
      connect: vi.fn().mockRejectedValue({ code: -1, message: "Freighter is not connected" }),
    });
    renderWallet(adapter, createApi());

    await user.click(await screen.findByRole("button", { name: "Connect Freighter" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Freighter is not connected");
  });

  it("shows an explicit trustline state instead of inventing a USDC balance", async () => {
    const adapter = createAdapter({
      restore: vi.fn().mockResolvedValue({ address, networkPassphrase: Networks.TESTNET }),
    });
    const api = createApi({
      readSession: vi
        .fn()
        .mockResolvedValue({ authenticated: true, address, expiresAt: "2026-08-10T00:00:00Z" }),
      readBalances: vi.fn().mockResolvedValue({
        address,
        xlm: "12.5000000",
        asset: { code: "USDC", balance: null, hasTrustline: false },
      }),
    });
    renderWallet(adapter, api);

    await userEvent.setup().click(await screen.findByRole("button", { name: /Open wallet menu/i }));
    const balanceRegion = screen.getByRole("region", { name: "Wallet balances" });
    expect(balanceRegion).toHaveTextContent("USDC not added");
    expect(balanceRegion).not.toHaveTextContent("0.0000000 USDC");
  });
});
