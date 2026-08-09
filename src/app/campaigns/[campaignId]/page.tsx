import { ArrowLeft, CalendarClock, CircleDollarSign, Gift, ShieldCheck, Store, TicketCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CampaignStatus } from "@/components/merchant/campaign-card";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { displayExpiration, displayUsdc, shortenStellarAddress } from "@/features/merchant/display";
import { getMerchantService } from "@/server/merchant/service";

export const dynamic = "force-dynamic";

export default async function PublicCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getMerchantService().getPublicCampaign(campaignId);
  if (!campaign) notFound();

  const bonus = BigInt(campaign.onchain.serviceValue) - BigInt(campaign.onchain.passPrice);
  const protectedPerPass =
    BigInt(campaign.onchain.passPrice) * BigInt(campaign.onchain.financialRules.reserveBps) /
    BigInt(10_000);
  const protectedPercent = campaign.onchain.financialRules.reserveBps / 100;

  return (
    <main id="main-content" className="py-10 sm:py-14">
      <Container>
        <Link className={buttonStyles({ variant: "ghost", size: "sm" })} href="/">
          <ArrowLeft aria-hidden="true" className="size-4" /> WrenPass home
        </Link>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:items-start">
          <Card className="overflow-hidden">
            {campaign.metadata.imageUrl && (
              <div role="img" aria-label="Campaign" className="h-64 bg-sage-soft bg-cover bg-center sm:h-80" style={{ backgroundImage: `url(${campaign.metadata.imageUrl})` }} />
            )}
            <div className="p-7 sm:p-9">
              <div className="flex flex-wrap items-center gap-3">
                <CampaignStatus status={campaign.onchain.status} />
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-ink-faint">Campaign #{campaign.onchain.id}</span>
              </div>
              <h1 className="mt-5 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">{campaign.metadata.name}</h1>
              <p className="mt-5 whitespace-pre-wrap text-base leading-8 text-ink-muted">{campaign.metadata.serviceDescription}</p>
              <div className="mt-8 flex items-center gap-4 border-t border-line pt-6">
                {campaign.merchant.logoUrl ? (
                  <span role="img" aria-label={`${campaign.merchant.businessName} logo`} className="size-12 rounded-2xl bg-sage-soft bg-cover bg-center" style={{ backgroundImage: `url(${campaign.merchant.logoUrl})` }} />
                ) : (
                  <span className="grid size-12 place-items-center rounded-2xl bg-mint-soft text-forest"><Store aria-hidden="true" className="size-5" /></span>
                )}
                <div><p className="font-extrabold text-ink">{campaign.merchant.businessName}</p><p className="mt-0.5 text-xs font-semibold text-ink-muted">Merchant {shortenStellarAddress(campaign.merchant.ownerWalletAddress)}</p></div>
              </div>
              <p className="mt-5 text-sm leading-7 text-ink-muted">{campaign.merchant.description}</p>
            </div>
          </Card>

          <div className="grid gap-5 lg:sticky lg:top-28">
            <Card className="p-7">
              <p className="eyebrow">Pass terms</p>
              <div className="mt-5 grid grid-cols-2 gap-5">
                {[
                  ["Pay today", displayUsdc(campaign.onchain.passPrice), CircleDollarSign],
                  ["Service value", displayUsdc(campaign.onchain.serviceValue), Gift],
                  ["Customer bonus", displayUsdc(bonus), TicketCheck],
                  ["Remaining", `${campaign.onchain.remaining} of ${campaign.onchain.maxSupply}`, TicketCheck],
                ].map(([label, value, Icon]) => {
                  const IconComponent = Icon as typeof CircleDollarSign;
                  return <div key={String(label)}><IconComponent aria-hidden="true" className="size-4 text-forest" /><p className="mt-3 text-xs font-bold uppercase tracking-[0.1em] text-ink-faint">{String(label)}</p><p className="mt-1 font-extrabold text-ink">{String(value)}</p></div>;
                })}
              </div>
              <p className="mt-6 flex items-start gap-2 border-t border-line pt-5 text-sm leading-6 text-ink-muted"><CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Expires {displayExpiration(campaign.onchain.expiresAt)}</p>
              <button className={buttonStyles({ className: "mt-6 w-full", size: "lg" })} disabled type="button">Buy with USDC</button>
              <p className="mt-3 text-center text-xs leading-5 text-ink-faint">Customer purchasing is enabled in the next product phase.</p>
            </Card>
            <Card className="border-forest/15 bg-mint-soft p-6">
              <div className="flex gap-3"><ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-forest" /><div><h2 className="font-extrabold text-ink">Customer-protection reserve</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{displayUsdc(protectedPerPass)} ({protectedPercent}%) from each purchase stays contract-controlled. It is not a guaranteed full refund; eligibility follows the campaign contract&apos;s deterministic cancellation and refund rules.</p></div></div>
            </Card>
          </div>
        </div>
      </Container>
    </main>
  );
}
