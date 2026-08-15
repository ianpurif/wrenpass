import { Store } from "lucide-react";
import Image from "next/image";

import { PurchasePanel } from "@/components/customer/purchase-panel";
import { CampaignStatus } from "@/components/merchant/campaign-card";
import { shortenStellarAddress } from "@/features/merchant/display";
import type { PublicCampaignDto } from "@/features/merchant/dto";
import type { StellarConfig } from "@/lib/stellar/config";

export function CampaignOffer({
  campaign,
  config,
}: {
  campaign: PublicCampaignDto;
  config: StellarConfig;
}) {
  const { merchant, metadata, onchain } = campaign;

  return (
    <article
      aria-labelledby="campaign-title"
      className="overflow-hidden rounded-[3px] border border-ink/15 bg-paper text-ink shadow-[0_34px_90px_rgba(23,36,31,0.14)]"
    >
      <div className="flex flex-col gap-3 border-b border-ink/15 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          {merchant.logoUrl ? (
            <span
              className="relative size-8 shrink-0 overflow-hidden bg-sage-soft"
            >
              <Image
                alt={`${merchant.businessName} logo`}
                className="object-cover"
                fill
                sizes="32px"
                src={merchant.logoUrl}
              />
            </span>
          ) : (
            <span className="grid size-8 shrink-0 place-items-center bg-mint-soft text-forest">
              <Store aria-hidden="true" className="size-4" strokeWidth={1.7} />
            </span>
          )}
          <p className="truncate text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-ink-muted">
            {merchant.businessName}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <CampaignStatus status={onchain.status} />
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-ink-faint">
            Campaign / {String(onchain.id).padStart(6, "0")}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.18fr)_minmax(21rem,0.82fr)]">
        <div className="min-w-0">
          {metadata.imageUrl && (
            <div
              className="relative aspect-[16/7] overflow-hidden border-b border-ink/15 bg-sage-soft"
            >
              <Image
                alt={`${metadata.name} campaign`}
                className="object-cover"
                fetchPriority="high"
                fill
                sizes="(max-width: 1023px) 100vw, 60vw"
                src={metadata.imageUrl}
              />
            </div>
          )}

          <div className="p-6 sm:p-8 lg:p-10">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-coral-strong">
              Limited future-service campaign
            </p>
            <h1
              id="campaign-title"
              className="landing-display mt-5 max-w-[13ch] text-[clamp(2.8rem,5vw,5.2rem)] leading-[0.9] tracking-[-0.06em]"
            >
              {metadata.name}
            </h1>
            <p className="mt-6 max-w-2xl whitespace-pre-wrap text-base leading-8 text-ink-muted">
              {metadata.serviceDescription}
            </p>

            <div className="mt-10 border-t border-ink/15 pt-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[0.64rem] font-bold uppercase tracking-[0.16em] text-ink-faint">
                    Offered by
                  </p>
                  <h2 className="mt-2 text-lg font-extrabold tracking-[-0.02em]">
                    {merchant.businessName}
                  </h2>
                </div>
                <p className="font-mono text-[0.68rem] text-ink-muted">
                  {shortenStellarAddress(merchant.ownerWalletAddress)}
                </p>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-muted">
                {merchant.description}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-dashed border-ink/25 bg-canvas/45 p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
          <PurchasePanel campaign={campaign} config={config} />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-ink/15 px-5 py-4 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <span>Service value issued by {merchant.businessName}</span>
        <span>Owner approval required to redeem</span>
      </div>
    </article>
  );
}
