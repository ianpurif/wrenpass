"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { buttonStyles } from "@/components/ui/button";
import { displayExpiration, displayUsdc } from "@/features/merchant/display";
import type { MerchantCampaignDto } from "@/features/merchant/dto";

const statusStyles = {
  Draft: { dot: "bg-coral", text: "text-coral-strong" },
  Active: { dot: "bg-forest", text: "text-forest" },
  Paused: { dot: "bg-ink-faint", text: "text-ink-muted" },
  Expired: { dot: "bg-ink-faint", text: "text-ink-muted" },
  Cancelled: { dot: "bg-danger", text: "text-danger" },
} as const;

export function CampaignStatus({ status }: { status: MerchantCampaignDto["onchain"]["status"] }) {
  const styles = statusStyles[status];
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-bold ${styles.text}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${styles.dot}`} />
      {status}
    </span>
  );
}

export function CampaignCard({ campaign }: { campaign: MerchantCampaignDto }) {
  const [copied, setCopied] = useState(false);
  const { metadata, onchain } = campaign;
  const raised = BigInt(onchain.passPrice) * BigInt(onchain.sold);

  async function copyLink() {
    const url = `${window.location.origin}/campaigns/${onchain.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <article className="border-b border-line px-5 py-5 last:border-b-0">
      <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1.5fr)_0.65fr_0.8fr_0.8fr_auto] md:items-center md:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {metadata.imageUrl ? (
            <div
              role="img"
              aria-label="Campaign"
              className="size-11 shrink-0 rounded-lg bg-sage-soft bg-cover bg-center"
              style={{ backgroundImage: `url(${metadata.imageUrl})` }}
            />
          ) : (
            <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-sage-soft text-xs font-bold text-forest">
              #{onchain.id}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="truncate font-bold text-ink">{metadata.name}</h3>
            <p className="mt-1 truncate text-xs text-ink-muted">Expires {displayExpiration(onchain.expiresAt)}</p>
          </div>
        </div>

        <div className="flex items-center justify-between md:block">
          <span className="text-xs font-semibold text-ink-faint md:hidden">Status</span>
          <CampaignStatus status={onchain.status} />
        </div>
        <div className="grid grid-cols-2 gap-4 border-y border-line py-4 md:block md:border-0 md:py-0">
          <div>
            <p className="text-xs text-ink-faint md:hidden">Supply</p>
            <p className="mt-1 text-sm font-bold text-ink md:mt-0">{onchain.sold} / {onchain.maxSupply}</p>
            <p className="mt-0.5 text-xs text-ink-faint">{onchain.remaining} remaining</p>
          </div>
          <div className="md:hidden">
            <p className="text-xs text-ink-faint">Protected</p>
            <p className="mt-1 text-sm font-bold text-ink">{displayUsdc(onchain.protectedFunds)}</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-ink-faint md:hidden">Raised</p>
          <p className="mt-1 text-sm font-bold text-ink md:mt-0">{displayUsdc(raised)}</p>
          <p className="mt-0.5 hidden text-xs text-ink-faint md:block">{displayUsdc(onchain.protectedFunds)} protected</p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Link className={buttonStyles({ variant: "secondary", size: "sm" })} href={`/campaigns/${onchain.id}`}>
            View <ExternalLink aria-hidden="true" className="size-3.5" />
          </Link>
          <button className={buttonStyles({ variant: "ghost", size: "sm" })} type="button" onClick={() => void copyLink()}>
            {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
    </article>
  );
}
