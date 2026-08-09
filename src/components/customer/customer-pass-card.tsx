"use client";

import { CalendarClock, ExternalLink, Gift, QrCode, ShieldCheck, TicketCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { GiftPassDialog } from "@/components/customer/gift-pass-dialog";
import { PassQrDialog } from "@/components/customer/pass-qr-dialog";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CustomerPassDto } from "@/features/customer/dto";
import { displayExpiration, displayUsdc } from "@/features/merchant/display";
import type { StellarConfig } from "@/lib/stellar/config";

const statusStyles = {
  Active: "bg-mint-soft text-forest",
  Redeemed: "bg-sage-soft text-ink-muted",
  Expired: "bg-sage-soft text-ink-muted",
  Refunded: "bg-coral-soft text-coral-strong",
} as const;

function displayPurchasedAt(epochSeconds: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(Number(epochSeconds) * 1_000),
  );
}

export function CustomerPassCard({
  config,
  pass,
  onGifted,
}: {
  config: StellarConfig;
  pass: CustomerPassDto;
  onGifted(): Promise<void>;
}) {
  const [giftOpen, setGiftOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const campaign = pass.campaign;
  const bonus = campaign
    ? BigInt(campaign.onchain.serviceValue) - BigInt(campaign.onchain.passPrice)
    : null;

  return (
    <>
      <Card className="overflow-hidden">
        {campaign?.metadata.imageUrl && (
          <div
            role="img"
            aria-label="Campaign"
            className="h-36 bg-sage-soft bg-cover bg-center"
            style={{ backgroundImage: `url(${campaign.metadata.imageUrl})` }}
          />
        )}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-faint">WrenPass #{pass.id}</p>
              <h3 className="mt-2 text-xl font-extrabold tracking-tight text-ink">
                {campaign?.metadata.name ?? `Campaign #${pass.campaignId}`}
              </h3>
              {campaign && <p className="mt-1 text-sm font-semibold text-ink-muted">{campaign.merchant.businessName}</p>}
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${statusStyles[pass.status]}`}>{pass.status}</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 border-y border-line py-4 text-sm">
            <div><p className="text-ink-faint">Paid</p><p className="mt-1 font-bold text-ink">{displayUsdc(pass.purchaseAmounts.total, config.assetCode)}</p></div>
            <div><p className="text-ink-faint">Service value</p><p className="mt-1 font-bold text-ink">{campaign ? displayUsdc(campaign.onchain.serviceValue, config.assetCode) : "Unavailable"}</p></div>
            <div><p className="text-ink-faint">Bonus</p><p className="mt-1 font-bold text-forest">{bonus === null ? "Unavailable" : displayUsdc(bonus, config.assetCode)}</p></div>
            <div><p className="text-ink-faint">Protected at purchase</p><p className="mt-1 font-bold text-ink">{displayUsdc(pass.purchaseAmounts.protectedReserve, config.assetCode)}</p></div>
          </div>

          <div className="mt-4 grid gap-2 text-xs font-semibold text-ink-muted">
            <p className="flex items-center gap-2"><TicketCheck aria-hidden="true" className="size-4 text-forest" />Purchased {displayPurchasedAt(pass.purchasedAt)}</p>
            {campaign && <p className="flex items-center gap-2"><CalendarClock aria-hidden="true" className="size-4 text-forest" />Expires {displayExpiration(campaign.onchain.expiresAt)}</p>}
            <p className="flex items-start gap-2"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-forest" />Reserve protection follows the campaign&apos;s contract-defined eligibility rules.</p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {campaign && (
              <Link className={buttonStyles({ variant: "secondary", size: "sm" })} href={`/campaigns/${pass.campaignId}`}>
                Campaign <ExternalLink aria-hidden="true" className="size-3.5" />
              </Link>
            )}
            {pass.status === "Active" && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setQrOpen(true)}>
                  <QrCode aria-hidden="true" className="size-3.5" /> Show QR
                </Button>
                <Button size="sm" onClick={() => setGiftOpen(true)}>
                  <Gift aria-hidden="true" className="size-3.5" /> Gift pass
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>
      <GiftPassDialog
        config={config}
        open={giftOpen}
        pass={pass}
        onGifted={onGifted}
        onOpenChange={setGiftOpen}
      />
      <PassQrDialog config={config} open={qrOpen} passId={pass.id} onOpenChange={setQrOpen} />
    </>
  );
}
