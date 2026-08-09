"use client";

import { ChevronDown, LoaderCircle, LogOut, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/wallet-provider";
import { cn } from "@/lib/cn";

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
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
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pending = status === "checking" || status === "connecting";

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
                <p className="mt-1 break-all font-mono text-xs leading-5 text-ink-muted">{address}</p>

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
              </div>

              <div className="border-t border-line bg-canvas p-3">
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
