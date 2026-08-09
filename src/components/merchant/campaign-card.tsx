"use client";

import { CalendarClock, Check, Copy, ExternalLink, ShieldCheck, TicketCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { displayExpiration, displayUsdc } from "@/features/merchant/display";
import type { MerchantCampaignDto } from "@/features/merchant/dto";

const statusStyles = {
  Draft: "bg-coral-soft text-coral-strong",
  Active: "bg-mint-soft text-forest",
  Paused: "bg-sage-soft text-ink-muted",
  Expired: "bg-sage-soft text-ink-muted",
  Cancelled: "bg-danger-soft text-danger",
} as const;

export function CampaignStatus({ status }: { status: MerchantCampaignDto["onchain"]["status"] }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${statusStyles[status]}`}>{status}</span>;
}

export function CampaignCard({ campaign }: { campaign: MerchantCampaignDto }) {
  const [copied, setCopied] = useState(false);
  const { metadata, onchain } = campaign;

  async function copyLink() {
    const url = `${window.location.origin}/campaigns/${onchain.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <Card className="overflow-hidden">
      {metadata.imageUrl && (
        <div
          role="img"
          aria-label="Campaign"
          className="h-40 bg-sage-soft bg-cover bg-center"
          style={{ backgroundImage: `url(${metadata.imageUrl})` }}
        />
      )}
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-faint">Campaign #{onchain.id}</p>
            <h3 className="mt-2 text-xl font-extrabold tracking-tight text-ink">{metadata.name}</h3>
          </div>
          <CampaignStatus status={onchain.status} />
        </div>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink-muted">{metadata.serviceDescription}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 border-y border-line py-4 text-sm">
          <div>
            <p className="text-ink-faint">Price</p>
            <p className="mt-1 font-bold text-ink">{displayUsdc(onchain.passPrice)}</p>
          </div>
          <div>
            <p className="text-ink-faint">Service value</p>
            <p className="mt-1 font-bold text-ink">{displayUsdc(onchain.serviceValue)}</p>
          </div>
          <div className="flex items-center gap-2">
            <TicketCheck aria-hidden="true" className="size-4 text-forest" />
            <span><strong>{onchain.sold}</strong> sold · {onchain.remaining} left</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-4 text-forest" />
            <span>{displayUsdc(onchain.protectedFunds)} protected</span>
          </div>
        </div>
        <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-ink-muted">
          <CalendarClock aria-hidden="true" className="size-4" />
          Expires {displayExpiration(onchain.expiresAt)}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link className={buttonStyles({ variant: "secondary", size: "sm" })} href={`/campaigns/${onchain.id}`}>
            View public page <ExternalLink aria-hidden="true" className="size-3.5" />
          </Link>
          <button className={buttonStyles({ variant: "ghost", size: "sm" })} type="button" onClick={() => void copyLink()}>
            {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
    </Card>
  );
}
