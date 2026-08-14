import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CampaignOffer } from "@/components/campaigns/campaign-offer";
import { CampaignTransactions } from "@/components/campaigns/campaign-transactions";
import { buttonStyles } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
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
  const [campaign, initialTransactions] = await Promise.all([
    getMerchantService().getPublicCampaign(campaignId),
    loadInitialTransactions(campaignId),
  ]);
  if (!campaign) notFound();
  const config = getStellarConfig();

  return (
    <main id="main-content" className="py-10 sm:py-14">
      <Container>
        <Link className={buttonStyles({ variant: "ghost", size: "sm" })} href="/">
          <ArrowLeft aria-hidden="true" className="size-4" /> WrenPass home
        </Link>
        <div className="mt-5">
          <CampaignOffer campaign={campaign} config={config} />
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
