"use client";

import { ExternalLink, Gift, QrCode } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

import { Button, buttonStyles } from "@/components/ui/button";
import type { CustomerPassDto } from "@/features/customer/dto";
import { displayExpiration, displayUsdc } from "@/features/merchant/display";
import type { StellarConfig } from "@/lib/stellar/config";

const GiftPassDialog = dynamic(() =>
  import("@/components/customer/gift-pass-dialog").then((module) => module.GiftPassDialog),
);
const PassQrDialog = dynamic(() =>
  import("@/components/customer/pass-qr-dialog").then((module) => module.PassQrDialog),
);

const statusStyles = {
  Active: { dot: "bg-forest", text: "text-forest", badge: "border-mint/70 bg-mint-soft" },
  Redeemed: { dot: "bg-ink-faint", text: "text-ink-muted", badge: "border-line bg-canvas" },
  Expired: { dot: "bg-ink-faint", text: "text-ink-muted", badge: "border-line bg-canvas" },
  Refunded: { dot: "bg-coral", text: "text-coral-strong", badge: "border-coral/30 bg-coral-soft" },
} as const;

function displayPurchasedAt(epochSeconds: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
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
  const statusClasses = statusStyles[pass.status];

  return (
    <>
      <article className="rounded-card border border-line bg-white p-5 sm:p-6">
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex min-w-0 items-start gap-3">
              {campaign?.metadata.imageUrl ? (
                <div
                  className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-sage-soft"
                >
                  <Image
                    alt="Campaign"
                    className="object-cover"
                    fill
                    sizes="48px"
                    src={campaign.metadata.imageUrl}
                  />
                </div>
              ) : (
                <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-sage-soft font-mono text-xs font-bold text-forest">
                  #{pass.id}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold text-ink-faint">WrenPass #{pass.id}</p>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-bold ${statusClasses.badge} ${statusClasses.text}`}>
                    <span aria-hidden="true" className={`size-1.5 rounded-full ${statusClasses.dot}`} />
                    {pass.status}
                  </span>
                </div>
                <h3 className="mt-1 truncate font-bold text-ink">
                  {campaign?.metadata.name ?? `Campaign #${pass.campaignId}`}
                </h3>
                {campaign && <p className="mt-0.5 truncate text-xs text-ink-muted">{campaign.merchant.businessName}</p>}
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-line py-4 sm:grid-cols-4">
              <div><dt className="text-xs text-ink-faint">Paid</dt><dd className="mt-1 text-sm font-bold text-ink">{displayUsdc(pass.purchaseAmounts.total, config.assetCode)}</dd></div>
              <div><dt className="text-xs text-ink-faint">Service value</dt><dd className="mt-1 text-sm font-bold text-ink">{campaign ? displayUsdc(campaign.onchain.serviceValue, config.assetCode) : "Unavailable"}</dd></div>
              <div><dt className="text-xs text-ink-faint">Bonus</dt><dd className="mt-1 text-sm font-bold text-forest">{bonus === null ? "Unavailable" : displayUsdc(bonus, config.assetCode)}</dd></div>
              <div><dt className="text-xs text-ink-faint">Protected</dt><dd className="mt-1 text-sm font-bold text-ink">{displayUsdc(pass.purchaseAmounts.protectedReserve, config.assetCode)}</dd></div>
            </dl>

            <div className="mt-4 flex flex-col gap-1 text-xs text-ink-muted sm:flex-row sm:flex-wrap sm:gap-x-5">
              <span>Purchased {displayPurchasedAt(pass.purchasedAt)}</span>
              {campaign && <span>Expires {displayExpiration(campaign.onchain.expiresAt)}</span>}
              <span>Reserve follows contract eligibility rules</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:w-36 lg:grid-cols-1 lg:flex-col">
            {pass.status === "Active" && (
              <>
                <Button className="w-full" size="sm" onClick={() => setQrOpen(true)}>
                  <QrCode aria-hidden="true" className="size-3.5" /> Show QR
                </Button>
                <Button className="w-full" size="sm" variant="secondary" onClick={() => setGiftOpen(true)}>
                  <Gift aria-hidden="true" className="size-3.5" /> Gift pass
                </Button>
              </>
            )}
            {campaign && (
              <Link className={buttonStyles({ className: "w-full", variant: "ghost", size: "sm" })} href={`/campaigns/${pass.campaignId}`}>
                Campaign <ExternalLink aria-hidden="true" className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      </article>
      {giftOpen && (
        <GiftPassDialog
          config={config}
          open
          pass={pass}
          onGifted={onGifted}
          onOpenChange={setGiftOpen}
        />
      )}
      {qrOpen && (
        <PassQrDialog config={config} open passId={pass.id} onOpenChange={setQrOpen} />
      )}
    </>
  );
}
