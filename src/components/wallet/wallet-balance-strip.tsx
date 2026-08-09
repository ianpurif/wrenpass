"use client";

import { RefreshCw, ShieldCheck } from "lucide-react";

import { Container } from "@/components/ui/container";
import { useWallet } from "@/components/wallet/wallet-provider";

export function WalletBalanceStrip() {
  const { balances, networkLabel, refreshBalances, status } = useWallet();

  if (status !== "connected" || !balances) return null;

  return (
    <section
      aria-label="Wallet balances"
      className="border-t border-forest/10 bg-mint-soft/80"
    >
      <Container className="flex min-h-12 flex-wrap items-center gap-x-5 gap-y-2 py-2 text-xs sm:justify-end">
        <span className="mr-auto inline-flex items-center gap-1.5 font-bold text-forest">
          <ShieldCheck aria-hidden="true" className="size-3.5" />
          Verified · {networkLabel}
        </span>

        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold uppercase tracking-[0.08em] text-ink-faint">XLM</span>
          <strong className="text-sm text-ink">{balances.xlm} XLM</strong>
        </div>

        <span aria-hidden="true" className="hidden h-4 w-px bg-forest/15 sm:block" />

        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold uppercase tracking-[0.08em] text-ink-faint">
            {balances.asset.code}
          </span>
          <strong className="text-sm text-ink">
            {balances.asset.hasTrustline
              ? `${balances.asset.balance} ${balances.asset.code}`
              : `${balances.asset.code} not added`}
          </strong>
        </div>

        <button
          type="button"
          aria-label="Refresh wallet balances"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted transition hover:bg-white hover:text-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
          onClick={() => void refreshBalances()}
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
        </button>
      </Container>
    </section>
  );
}
