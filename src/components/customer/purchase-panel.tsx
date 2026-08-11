"use client";

import { CalendarClock, CheckCircle2, ExternalLink, LoaderCircle, ShieldCheck, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useReviewPrompt } from "@/components/reviews/review-prompt-provider";
import { useWallet } from "@/components/wallet/wallet-provider";
import { parseUsdcBalance } from "@/features/merchant/campaign-terms";
import { displayExpiration, displayUsdc } from "@/features/merchant/display";
import type { PublicCampaignDto } from "@/features/merchant/dto";
import { syncEventsAfterMutation } from "@/features/notifications/api";
import type { StellarConfig } from "@/lib/stellar/config";
import { stellarTransactionUrl } from "@/lib/stellar/explorer";
import { StellarCustomerContractWriter } from "@/lib/stellar/wrenpass-client";

function readableError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The purchase could not be completed.";
}

export function PurchasePanel({
  campaign,
  config,
}: {
  campaign: PublicCampaignDto;
  config: StellarConfig;
}) {
  const router = useRouter();
  const { requestReview } = useReviewPrompt();
  const {
    address,
    balances,
    connect,
    error: walletError,
    refreshBalances,
    signTransaction,
    status,
  } = useWallet();
  const writer = useMemo(() => new StellarCustomerContractWriter(config), [config]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchaseReceipt, setPurchaseReceipt] = useState<{
    passId: string;
    transactionHash: string;
  } | null>(null);
  const price = BigInt(campaign.onchain.passPrice);
  const value = BigInt(campaign.onchain.serviceValue);
  const bonus = value - price;
  const reserve = price * BigInt(campaign.onchain.financialRules.reserveBps) / BigInt(10_000);
  const reservePercent = campaign.onchain.financialRules.reserveBps / 100;
  const active = campaign.onchain.status === "Active";
  const soldOut = campaign.onchain.remaining === 0;
  const soldPercent = Math.min(
    100,
    Math.round((campaign.onchain.sold / campaign.onchain.maxSupply) * 100),
  );
  const connected = status === "connected" && Boolean(address);
  const hasTrustline = balances?.asset.hasTrustline ?? false;
  const balance = balances?.asset.balance ? parseUsdcBalance(balances.asset.balance) : BigInt(0);
  const insufficientBalance = connected && hasTrustline && balance < price;

  async function beginPurchase() {
    setError(null);
    if (!connected) {
      await connect();
      return;
    }
    setDialogOpen(true);
  }

  async function confirmPurchase() {
    if (!address) return;
    setPending(true);
    setError(null);
    try {
      const receipt = await writer.purchase({
        campaignId: BigInt(campaign.onchain.id),
        customer: address,
        signTransaction: (transactionXdr: string) => signTransaction(transactionXdr),
      });
      setPurchaseReceipt({
        passId: receipt.passId.toString(),
        transactionHash: receipt.transactionHash,
      });
      setDialogOpen(false);
      requestReview({ transactionLabel: "pass purchase" });
      await Promise.allSettled([syncEventsAfterMutation(), refreshBalances()]);
      router.refresh();
    } catch (purchaseError) {
      setError(readableError(purchaseError));
    } finally {
      setPending(false);
    }
  }

  let actionLabel = "Buy with USDC";
  if (!active) actionLabel = campaign.onchain.status === "Expired" ? "Campaign expired" : "Purchases unavailable";
  else if (soldOut) actionLabel = "Sold out";
  else if (!connected) actionLabel = "Connect wallet to buy";
  else if (!hasTrustline) actionLabel = `${config.assetCode} trustline required`;
  else if (insufficientBalance) actionLabel = `Insufficient ${config.assetCode}`;

  return (
    <div>
      <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-coral-strong">
        Pass terms
      </p>

      <dl className="mt-5 grid grid-cols-2 border-y border-ink/15">
        <div className="py-5 pr-4">
          <dt className="text-[0.64rem] font-bold uppercase tracking-[0.15em] text-ink-faint">
            Pay today
          </dt>
          <dd className="mt-2 text-2xl font-extrabold tracking-[-0.04em] text-ink sm:text-3xl">
            {displayUsdc(price, config.assetCode)}
          </dd>
        </div>
        <div className="border-l border-ink/15 py-5 pl-4">
          <dt className="text-[0.64rem] font-bold uppercase tracking-[0.15em] text-ink-faint">
            Service value
          </dt>
          <dd className="mt-2 text-2xl font-extrabold tracking-[-0.04em] text-ink sm:text-3xl">
            {displayUsdc(value, config.assetCode)}
          </dd>
        </div>
        <div className="border-t border-ink/15 py-5 pr-4">
          <dt className="text-[0.64rem] font-bold uppercase tracking-[0.15em] text-ink-faint">
            Customer bonus
          </dt>
          <dd className="mt-2 text-base font-extrabold text-forest">
            +{displayUsdc(bonus, config.assetCode)}
          </dd>
        </div>
        <div className="border-l border-t border-ink/15 py-5 pl-4">
          <dt className="text-[0.64rem] font-bold uppercase tracking-[0.15em] text-ink-faint">
            Remaining passes
          </dt>
          <dd className="mt-2 text-base font-extrabold text-ink">
            {campaign.onchain.remaining} of {campaign.onchain.maxSupply}
          </dd>
        </div>
      </dl>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="font-bold text-ink">{campaign.onchain.sold} sold</span>
          <span className="text-ink-muted">{campaign.onchain.remaining} remaining</span>
        </div>
        <div
          aria-label="Passes sold"
          aria-valuemax={campaign.onchain.maxSupply}
          aria-valuemin={0}
          aria-valuenow={campaign.onchain.sold}
          className="mt-3 h-1 bg-ink/10"
          role="progressbar"
        >
          <div className="h-full bg-coral" style={{ width: `${soldPercent}%` }} />
        </div>
      </div>

      <p className="mt-6 flex items-start gap-2 text-sm leading-6 text-ink-muted">
        <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Expires {displayExpiration(campaign.onchain.expiresAt)}
      </p>
      <Button
        className="mt-6 w-full rounded-[3px] px-3 text-sm sm:px-6 sm:text-base"
        disabled={!active || soldOut || (connected && (!hasTrustline || insufficientBalance)) || pending}
        size="lg"
        onClick={() => void beginPurchase()}
      >
        {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <WalletCards aria-hidden="true" className="size-4" />}
        {actionLabel}
      </Button>
      {walletError && !connected && (
        <p role="alert" className="mt-3 text-center text-sm font-semibold text-danger">{walletError}</p>
      )}
      {error && !dialogOpen && <p role="alert" className="mt-3 text-center text-sm font-semibold text-danger">{error}</p>}
      {purchaseReceipt && (
        <div role="status" className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-semibold text-forest">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 aria-hidden="true" className="size-4" /> Pass #{purchaseReceipt.passId} purchased.
          </span>
          <a
            className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
            href={stellarTransactionUrl(config.network, purchaseReceipt.transactionHash)}
            rel="noreferrer"
            target="_blank"
          >
            View on-chain <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </div>
      )}

      <div className="mt-8 border-t border-ink/15 pt-6">
        <div className="flex gap-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-forest" strokeWidth={1.7} />
          <div>
            <h2 className="text-sm font-extrabold text-ink">Customer-protection reserve</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              {displayUsdc(reserve, config.assetCode)} ({reservePercent}%) stays contract-controlled. This is not a guaranteed full refund; eligibility follows the campaign&apos;s deterministic contract rules.
            </p>
          </div>
        </div>
      </div>

      <Dialog
        description="Review the exact on-chain terms before asking Freighter to approve the transaction."
        open={dialogOpen}
        title={`Buy ${campaign.metadata.name}`}
        onOpenChange={(open) => !pending && setDialogOpen(open)}
      >
        <dl className="grid grid-cols-2 gap-4 rounded-2xl bg-canvas p-4 text-sm">
          <div><dt className="text-ink-faint">Amount paid</dt><dd className="mt-1 font-extrabold text-ink">{displayUsdc(price, config.assetCode)}</dd></div>
          <div><dt className="text-ink-faint">Service value</dt><dd className="mt-1 font-extrabold text-ink">{displayUsdc(value, config.assetCode)}</dd></div>
          <div><dt className="text-ink-faint">Bonus</dt><dd className="mt-1 font-extrabold text-forest">{displayUsdc(bonus, config.assetCode)}</dd></div>
          <div><dt className="text-ink-faint">Protected amount</dt><dd className="mt-1 font-extrabold text-ink">{displayUsdc(reserve, config.assetCode)}</dd></div>
        </dl>
        <p className="mt-4 text-sm leading-6 text-ink-muted">The contract—not this page—calculates the payment and assigns one unique pass to the connected wallet.</p>
        {error && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={pending} variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button disabled={pending} onClick={() => void confirmPurchase()}>
            {pending && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            Approve {displayUsdc(price, config.assetCode)}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
