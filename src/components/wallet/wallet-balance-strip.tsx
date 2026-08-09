"use client";

import { RefreshCw, ShieldCheck } from "lucide-react";

import { useWallet } from "@/components/wallet/wallet-provider";
import { cn } from "@/lib/cn";

export function WalletBalanceStrip({ className }: { className?: string }) {
  const { balances, networkLabel, refreshBalances, status } = useWallet();

  if (status !== "connected" || !balances) return null;

  return (
    <div
      role="region"
      aria-label="Wallet balances"
      className={cn(
        "grid min-w-0 grid-cols-2 gap-2 text-[11px] sm:flex sm:items-center",
        className,
      )}
    >
      <div className="col-span-2 inline-flex min-w-0 items-center justify-between gap-2 rounded-xl border border-forest/15 bg-mint-soft/80 px-2.5 py-1.5 font-bold text-forest sm:col-span-1 sm:rounded-full">
        <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          <ShieldCheck aria-hidden="true" className="size-3.5" />
          Verified · {networkLabel}
        </span>
        <button
          type="button"
          aria-label="Refresh wallet balances"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-muted transition hover:bg-white hover:text-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
          onClick={() => void refreshBalances()}
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
        </button>
      </div>

      <div className="inline-flex min-w-0 items-baseline gap-1.5 rounded-xl border border-line bg-white px-2.5 py-1.5 sm:rounded-lg sm:border-transparent sm:bg-transparent sm:px-0 sm:py-0">
        <span className="font-semibold uppercase tracking-[0.08em] text-ink-faint">XLM</span>
        <strong className="min-w-0 truncate text-xs text-ink">{balances.xlm} XLM</strong>
      </div>

      <div className="inline-flex min-w-0 items-baseline gap-1.5 rounded-xl border border-line bg-white px-2.5 py-1.5 sm:rounded-lg sm:border-transparent sm:bg-transparent sm:px-0 sm:py-0">
        <span className="font-semibold uppercase tracking-[0.08em] text-ink-faint">{balances.asset.code}</span>
        <strong className="min-w-0 truncate text-xs text-ink">
          {balances.asset.hasTrustline
            ? `${balances.asset.balance} ${balances.asset.code}`
            : `${balances.asset.code} not added`}
        </strong>
      </div>
    </div>
  );
}
