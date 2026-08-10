"use client";

import { Check, ChevronDown, Copy, LoaderCircle, LogOut, RefreshCw, Settings2, ShieldCheck, WalletCards } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/wallet-provider";
import { cn } from "@/lib/cn";

function shortenAddress(address: string): string {
  return `${address.slice(0, 7)}...${address.slice(-7)}`;
}

export function WalletButton({ className }: { className?: string }) {
  const {
    address,
    balances,
    connect,
    disconnect,
    error,
    networkLabel,
    refreshBalances,
    status,
  } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const copyResetRef = useRef<number | null>(null);
  const pending = status === "checking" || status === "connecting";

  useEffect(() => () => {
    if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePress);
    };
  }, [menuOpen]);

  const assetCode = balances?.asset.code ?? "Asset";
  const assetBalance = balances?.asset.hasTrustline
    ? `${balances.asset.balance} ${assetCode}`
    : `${assetCode} not added`;

  async function copyAddress() {
    if (!address) return;
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(address);
      setAddressCopied(true);
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
      copyResetRef.current = window.setTimeout(() => setAddressCopied(false), 1_500);
    } catch {
      setAddressCopied(false);
      setCopyError("Could not copy the wallet address.");
    }
  }

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      {status === "connected" && address ? (
        <>
          <Button
            ref={triggerRef}
            aria-controls="wallet-details-menu"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            aria-label={`Open wallet menu for ${address}`}
            className="w-full"
            size="sm"
            variant="secondary"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <WalletCards aria-hidden="true" className="size-4 text-forest" />
            {shortenAddress(address)}
            <ChevronDown
              aria-hidden="true"
              className={cn("size-3.5 text-ink-faint transition-transform", menuOpen && "rotate-180")}
            />
          </Button>

          {menuOpen && (
            <div
              id="wallet-details-menu"
              role="dialog"
              aria-label="Wallet details"
              className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-line bg-white text-left shadow-dialog"
            >
              <div className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-forest/15 bg-mint-soft px-2.5 py-1.5 text-[11px] font-bold text-forest">
                    <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="truncate">Verified · {networkLabel}</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Refresh wallet balances"
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted transition hover:bg-sage-soft hover:text-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                    onClick={() => void refreshBalances()}
                  >
                    <RefreshCw aria-hidden="true" className="size-3.5" />
                  </button>
                </div>

                <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint">Connected wallet</p>
                <button
                  type="button"
                  aria-label="Copy full wallet address"
                  className="mt-1 flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-sage-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                  onClick={() => void copyAddress()}
                >
                  <span className="min-w-0 truncate font-mono text-xs text-ink-muted">{shortenAddress(address)}</span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-forest">
                    {addressCopied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
                    {addressCopied ? "Copied" : "Copy"}
                  </span>
                </button>

                <div aria-label="Wallet balances" className="mt-4 grid grid-cols-2 gap-2" role="region">
                  <div className="min-w-0 rounded-xl border border-line bg-canvas p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">XLM balance</p>
                    <p className="mt-1 truncate text-sm font-extrabold text-ink">{balances?.xlm ?? "Unavailable"} XLM</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-line bg-canvas p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">{assetCode} balance</p>
                    <p className="mt-1 truncate text-sm font-extrabold text-ink">{assetBalance}</p>
                  </div>
                </div>

                {error && <p role="alert" className="mt-3 text-xs font-semibold leading-5 text-danger">{error}</p>}
                {copyError && <p role="alert" className="mt-3 text-xs font-semibold leading-5 text-danger">{copyError}</p>}
              </div>

              <div className="grid gap-2 border-t border-line bg-canvas p-3">
                <Link
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-semibold text-ink transition-colors hover:border-forest/35 hover:bg-mint-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                  href="/merchant/business-identity"
                  onClick={() => setMenuOpen(false)}
                >
                  <Settings2 aria-hidden="true" className="size-4" />
                  Business Profile
                </Link>
                <Button
                  className="w-full"
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setMenuOpen(false);
                    void disconnect();
                  }}
                >
                  <LogOut aria-hidden="true" className="size-4" />
                  Disconnect Wallet
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <Button
          className="w-full"
          disabled={pending}
          size="sm"
          onClick={() => {
            setMenuOpen(false);
            void connect();
          }}
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <WalletCards aria-hidden="true" className="size-4" />
          )}
          {status === "checking"
            ? "Checking wallet"
            : status === "connecting"
              ? "Connecting"
              : "Connect Freighter"}
        </Button>
      )}

      {error && status !== "connected" && (
        <div
          role="alert"
          className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-72 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2.5 text-left text-xs font-semibold leading-5 text-danger shadow-soft"
        >
          {error}
        </div>
      )}
    </div>
  );
}
