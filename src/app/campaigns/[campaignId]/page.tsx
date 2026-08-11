import { ArrowLeft, Store } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CampaignTransactions } from "@/components/campaigns/campaign-transactions";
import { CampaignStatus } from "@/components/merchant/campaign-card";
import { PurchasePanel } from "@/components/customer/purchase-panel";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { shortenStellarAddress } from "@/features/merchant/display";
import type { CampaignTransactionPageDto } from "@/features/campaign-transactions/dto";
import { getStellarConfig } from "@/lib/stellar/config";
import { getCampaignTransactionIndex } from "@/server/campaign-transactions/service";
import { getMerchantService } from "@/server/merchant/service";

export const dynamic = "force-dynamic";

async function loadInitialTransactions(campaignId: string): Promise<{
  error: string | null;
  page: CampaignTransactionPageDto;
}> {
  try {
    return {
      error: null,
      page: await getCampaignTransactionIndex().readPage({ campaignId, limit: 10 }),
    };
  } catch (error) {
    console.error("Unable to render campaign transactions", error);
    return {
      error: "Campaign transactions are temporarily unavailable. Try again in a moment.",
      page: { transactions: [], nextCursor: null, hasMore: false },
    };
  }
}

export default async function PublicCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getMerchantService().getPublicCampaign(campaignId);
  if (!campaign) notFound();
  const config = getStellarConfig();
  const initialTransactions = await loadInitialTransactions(campaignId);

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

          <div className="lg:sticky lg:top-28">
            <PurchasePanel campaign={campaign} config={config} />
          </div>
        </div>
        <CampaignTransactions
          key={`${initialTransactions.page.transactions[0]?.id ?? "empty"}:${initialTransactions.error ?? "ready"}`}
          assetCode={config.assetCode}
          campaignId={campaignId}
          initialError={initialTransactions.error}
          initialPage={initialTransactions.page}
          network={config.network}
        />
      </Container>
    </main>
  );
}
