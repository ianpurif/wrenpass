"use client";

import { ArrowDown, ArrowRight, LoaderCircle, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useWallet } from "@/components/wallet/wallet-provider";

const primaryAction =
  "inline-flex h-12 items-center justify-center gap-3 rounded-[2px] bg-white px-6 text-sm font-bold text-ink transition-colors hover:bg-mint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-60";
const secondaryAction =
  "inline-flex h-12 items-center justify-center gap-3 rounded-[2px] border border-white/45 px-6 text-sm font-bold text-white transition-colors hover:border-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

export function LandingStartActions() {
  const router = useRouter();
  const { connect, status } = useWallet();
  const [openingMerchant, setOpeningMerchant] = useState(false);
  const walletPending = status === "checking" || status === "connecting";

  async function startMerchant() {
    setOpeningMerchant(true);
    const connected = await connect();
    if (connected) router.push("/merchant");
    setOpeningMerchant(false);
  }

  return (
    <div className="mt-9">
      <div className="flex flex-col gap-3 sm:flex-row">
        {status === "connected" ? (
          <>
            <Link className={primaryAction} href="/passes">
              View my passes
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link className={secondaryAction} href="/merchant">
              Merchant dashboard
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </>
        ) : (
          <>
            <button
              className={primaryAction}
              disabled={walletPending || openingMerchant}
              type="button"
              onClick={() => void startMerchant()}
            >
              {walletPending || openingMerchant ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <WalletCards aria-hidden="true" className="size-4" />
              )}
              {status === "checking"
                ? "Checking wallet"
                : status === "connecting" || openingMerchant
                  ? "Connecting"
                  : "Start as a business"}
            </button>
            <Link className={secondaryAction} href="#campaign-example">
              See a sample campaign
              <ArrowDown aria-hidden="true" className="size-4" />
            </Link>
          </>
        )}
      </div>
      <p className="mt-4 max-w-lg text-sm leading-6 text-white/58">
        Customers buy from a campaign link shared directly by a business. No marketplace or speculative token required.
      </p>
    </div>
  );
}
