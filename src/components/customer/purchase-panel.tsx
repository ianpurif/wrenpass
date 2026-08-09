"use client";

import { CalendarClock, CheckCircle2, CircleDollarSign, Gift, LoaderCircle, ShieldCheck, TicketCheck, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { useWallet } from "@/components/wallet/wallet-provider";
import { parseUsdcBalance } from "@/features/merchant/campaign-terms";
import { displayExpiration, displayUsdc } from "@/features/merchant/display";
import type { PublicCampaignDto } from "@/features/merchant/dto";
import type { StellarConfig } from "@/lib/stellar/config";
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
  const { address, balances, connect, refreshBalances, signTransaction, status } = useWallet();
  const writer = useMemo(() => new StellarCustomerContractWriter(config), [config]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchasedPassId, setPurchasedPassId] = useState<string | null>(null);
  const price = BigInt(campaign.onchain.passPrice);
  const value = BigInt(campaign.onchain.serviceValue);
  const bonus = value - price;
  const reserve = price * BigInt(campaign.onchain.financialRules.reserveBps) / BigInt(10_000);
  const reservePercent = campaign.onchain.financialRules.reserveBps / 100;
  const active = campaign.onchain.status === "Active";
  const soldOut = campaign.onchain.remaining === 0;
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
      const passId = await writer.purchase({
        campaignId: BigInt(campaign.onchain.id),
        customer: address,
        signTransaction: (transactionXdr: string) => signTransaction(transactionXdr),
      });
      setPurchasedPassId(passId.toString());
      await refreshBalances();
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
    <div className="grid gap-5">
      <Card className="p-7">
        <p className="eyebrow">Pass terms</p>
        <div className="mt-5 grid grid-cols-2 gap-5">
          {[
            ["Pay today", displayUsdc(price, config.assetCode), CircleDollarSign],
            ["Service value", displayUsdc(value, config.assetCode), Gift],
            ["Customer bonus", displayUsdc(bonus, config.assetCode), TicketCheck],
            ["Remaining", `${campaign.onchain.remaining} of ${campaign.onchain.maxSupply}`, TicketCheck],
          ].map(([label, content, Icon]) => {
            const IconComponent = Icon as typeof CircleDollarSign;
            return (
              <div key={String(label)}>
                <IconComponent aria-hidden="true" className="size-4 text-forest" />
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.1em] text-ink-faint">{String(label)}</p>
                <p className="mt-1 font-extrabold text-ink">{String(content)}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-6 flex items-start gap-2 border-t border-line pt-5 text-sm leading-6 text-ink-muted">
          <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Expires {displayExpiration(campaign.onchain.expiresAt)}
        </p>
        <Button
          className="mt-6 w-full"
          disabled={!active || soldOut || (connected && (!hasTrustline || insufficientBalance)) || pending}
          size="lg"
          onClick={() => void beginPurchase()}
        >
          {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <WalletCards aria-hidden="true" className="size-4" />}
          {actionLabel}
        </Button>
        {error && !dialogOpen && <p role="alert" className="mt-3 text-center text-sm font-semibold text-danger">{error}</p>}
        {purchasedPassId && (
          <p role="status" className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-forest">
            <CheckCircle2 aria-hidden="true" className="size-4" /> Pass #{purchasedPassId} purchased.
          </p>
        )}
      </Card>

      <Card className="border-forest/15 bg-mint-soft p-6">
        <div className="flex gap-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-forest" />
          <div>
            <h2 className="font-extrabold text-ink">Customer-protection reserve</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              {displayUsdc(reserve, config.assetCode)} ({reservePercent}%) stays contract-controlled. This is not a guaranteed full refund; eligibility follows the campaign&apos;s deterministic contract rules.
            </p>
          </div>
        </div>
      </Card>

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
