"use client";

import {
  ArrowLeft,
  LoaderCircle,
  Plus,
  RefreshCcw,
  ScanLine,
  Store,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CampaignCard } from "@/components/merchant/campaign-card";
import { CampaignForm } from "@/components/merchant/campaign-form";
import { MerchantProfileForm } from "@/components/merchant/profile-form";
import { RedemptionScanner } from "@/components/merchant/redemption-scanner";
import { NotificationEmailForm } from "@/components/notifications/notification-email-form";
import { Button, buttonStyles } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/feedback-state";
import { useWallet } from "@/components/wallet/wallet-provider";
import { merchantApi } from "@/features/merchant/api";
import { displayUsdc, shortenStellarAddress } from "@/features/merchant/display";
import type { MerchantDashboardDto } from "@/features/merchant/dto";
import { notificationApi } from "@/features/notifications/api";
import type { StellarConfig } from "@/lib/stellar/config";

export type MerchantWorkspacePage =
  | "overview"
  | "business-identity"
  | "redeem-pass"
  | "create-campaign";

const pageCopy: Record<MerchantWorkspacePage, { label: string; title: string; description: string }> = {
  overview: {
    label: "Overview",
    title: "Merchant dashboard",
    description: "Monitor your campaigns, funding, supply, and redemptions.",
  },
  "business-identity": {
    label: "Business profile",
    title: "Business profile",
    description: "Manage the public business information shown on every campaign.",
  },
  "redeem-pass": {
    label: "Fulfillment",
    title: "Redeem a pass",
    description: "Scan a customer pass and prepare the owner-approved redemption.",
  },
  "create-campaign": {
    label: "Campaigns",
    title: "Create campaign",
    description: "Define a fixed-supply offer and publish its terms on Stellar.",
  },
};

function MerchantSetupRequired() {
  return (
    <section className="rounded-2xl border border-line bg-white p-6 sm:p-8" aria-labelledby="merchant-setup-heading">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-coral-strong">Setup required</p>
          <h2 id="merchant-setup-heading" className="mt-2 text-xl font-bold tracking-tight text-ink">
            Add your business profile before continuing
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
            Campaigns and redemptions need a business name and public description tied to this wallet.
          </p>
        </div>
        <Link className={buttonStyles({ className: "shrink-0", size: "sm" })} href="/merchant/business-identity">
          Set up business profile
        </Link>
      </div>
    </section>
  );
}

export function MerchantWorkspace({
  config,
  page = "overview",
}: {
  config: StellarConfig;
  page?: MerchantWorkspacePage;
}) {
  const { address, connect, error: walletError, status } = useWallet();
  const [dashboard, setDashboard] = useState<MerchantDashboardDto | null>(null);
  const [loadedAddress, setLoadedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!address) {
      setDashboard(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDashboard(await merchantApi.getDashboard());
      setLoadedAddress(address);
      try {
        await notificationApi.syncEvents();
        setSyncWarning(null);
      } catch {
        setSyncWarning("On-chain data is current. Event and email sync will retry later.");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    let active = true;
    merchantApi.getDashboard().then(
      (nextDashboard) => {
        if (!active) return;
        setDashboard(nextDashboard);
        setLoadedAddress(address);
        setError(null);
        void notificationApi.syncEvents().then(
          () => active && setSyncWarning(null),
          () => active && setSyncWarning("On-chain data is current. Event and email sync will retry later."),
        );
      },
      (loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load the dashboard.");
      },
    );
    return () => {
      active = false;
    };
  }, [address]);

  const totals = useMemo(() => {
    const campaigns = dashboard?.campaigns ?? [];
    return campaigns.reduce(
      (total, campaign) => ({
        raised: total.raised + BigInt(campaign.onchain.passPrice) * BigInt(campaign.onchain.sold),
        sold: total.sold + campaign.onchain.sold,
        remaining: total.remaining + campaign.onchain.remaining,
        redeemed: total.redeemed + campaign.onchain.redeemed,
        merchantFunds: total.merchantFunds + BigInt(campaign.onchain.merchantReleased),
        protectedFunds: total.protectedFunds + BigInt(campaign.onchain.protectedFunds),
      }),
      { raised: BigInt(0), sold: 0, remaining: 0, redeemed: 0, merchantFunds: BigInt(0), protectedFunds: BigInt(0) },
    );
  }, [dashboard]);

  if (status === "checking") {
    return <LoadingState className="min-h-[28rem]" label="Checking your wallet session" />;
  }

  if (status !== "connected" || !address) {
    return (
      <section className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-8 text-center sm:p-10">
        <Store aria-hidden="true" className="mx-auto size-6 text-forest" />
        <h2 className="mt-5 text-xl font-bold tracking-tight text-ink">Connect your merchant wallet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">
          Connect Freighter to load campaigns owned by this wallet and authorize merchant actions.
        </p>
        {walletError && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{walletError}</p>}
        <Button className="mt-6" onClick={() => void connect()}>Connect Freighter</Button>
      </section>
    );
  }

  if (loadedAddress !== address || (loading && !dashboard)) {
    return <LoadingState className="min-h-[28rem]" label="Loading merchant workspace" />;
  }
  if (error && !dashboard) return <ErrorState description={error} onRetry={() => void loadDashboard()} />;
  if (!dashboard) return null;

  const stats = [
    { label: "USDC raised", value: displayUsdc(totals.raised) },
    { label: "Passes sold", value: String(totals.sold) },
    { label: "Remaining", value: String(totals.remaining) },
    { label: "Redeemed", value: String(totals.redeemed) },
    { label: "Released", value: displayUsdc(totals.merchantFunds) },
    { label: "Protected", value: displayUsdc(totals.protectedFunds) },
  ];
  const activePageCopy = pageCopy[page];
  const dashboardTitle = page === "overview" && dashboard.merchant
    ? dashboard.merchant.businessName
    : activePageCopy.title;

  return (
    <div className="min-w-0">
        {page !== "overview" && (
          <Link
            className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition hover:text-forest"
            href="/merchant"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Merchant overview
          </Link>
        )}
        <header className="flex flex-col gap-5 border-b border-line pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-coral-strong">{activePageCopy.label}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-ink sm:text-3xl">{dashboardTitle}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">{activePageCopy.description}</p>
            <p className="mt-2 text-xs font-semibold text-ink-faint">
              {shortenStellarAddress(address)} · {config.network === "testnet" ? "Testnet" : "Mainnet"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {page === "overview" && dashboard.merchant && (
              <>
                <Link className={buttonStyles({ size: "sm", variant: "secondary" })} href="/merchant/redeem-pass">
                  <ScanLine aria-hidden="true" className="size-4" /> Redeem pass
                </Link>
                <Link className={buttonStyles({ size: "sm" })} href="/merchant/create-campaign">
                  <Plus aria-hidden="true" className="size-4" /> New campaign
                </Link>
              </>
            )}
            <Button disabled={loading} size="sm" variant="ghost" onClick={() => void loadDashboard()}>
              {loading ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCcw aria-hidden="true" className="size-4" />}
              Refresh
            </Button>
          </div>
        </header>

        <div className="mt-7 grid gap-7">
          {error && <ErrorState description={error} onRetry={() => void loadDashboard()} />}
          {syncWarning && (
            <p role="status" className="border-l-2 border-coral bg-coral-soft px-4 py-3 text-sm font-semibold text-ink-muted">
              {syncWarning}
            </p>
          )}

          {page === "overview" && (
            dashboard.merchant ? (
              <>
                <section aria-label="Campaign performance" className="overflow-hidden rounded-2xl border border-line bg-white">
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
                    {stats.map(({ label, value }, index) => (
                      <div
                        className={`min-w-0 p-4 sm:p-5 ${index % 2 ? "border-l border-line" : ""} ${
                          index >= 2 ? "border-t border-line sm:border-t-0" : ""
                        } ${index >= 3 ? "sm:border-t sm:border-line xl:border-t-0" : ""} ${
                          index > 0 ? "xl:border-l xl:border-line" : ""
                        }`}
                        key={label}
                      >
                        <p className="truncate text-xs font-semibold text-ink-muted">{label}</p>
                        <p className="mt-2 truncate text-xl font-bold tracking-tight text-ink">{value}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section aria-labelledby="campaigns-heading">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 id="campaigns-heading" className="text-lg font-bold tracking-tight text-ink">Campaigns</h2>
                      <p className="mt-1 text-sm text-ink-muted">Current on-chain performance and public sharing links.</p>
                    </div>
                    <span className="text-sm font-semibold text-ink-faint">{dashboard.campaigns.length} total</span>
                  </div>
                  {dashboard.campaigns.length ? (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
                      <div className="hidden grid-cols-[minmax(0,1.5fr)_0.65fr_0.8fr_0.8fr_auto] gap-4 border-b border-line bg-canvas px-5 py-3 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-ink-faint md:grid">
                        <span>Campaign</span><span>Status</span><span>Supply</span><span>Raised</span><span className="text-right">Actions</span>
                      </div>
                      {dashboard.campaigns.map((campaign) => <CampaignCard campaign={campaign} key={campaign.onchain.id} />)}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
                      <p className="font-bold text-ink">No campaigns yet</p>
                      <p className="mt-1 text-sm text-ink-muted">Create a campaign when your service offer is ready.</p>
                      <Link className={buttonStyles({ className: "mt-5", size: "sm" })} href="/merchant/create-campaign">New campaign</Link>
                    </div>
                  )}
                </section>
              </>
            ) : <MerchantSetupRequired />
          )}

          {page === "business-identity" && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <section aria-labelledby="merchant-profile-heading" className="rounded-2xl border border-line bg-white">
                <div className="border-b border-line px-6 py-5 sm:px-7">
                  <h2 id="merchant-profile-heading" className="font-bold text-ink">Public business details</h2>
                  <p className="mt-1 text-sm leading-6 text-ink-muted">Used on every campaign page shared with customers.</p>
                </div>
                <div className="p-6 sm:p-7">
                  <MerchantProfileForm
                    merchant={dashboard.merchant}
                    onSaved={(merchant) => setDashboard((current) => current ? { ...current, merchant } : current)}
                  />
                </div>
              </section>
              <aside className="self-start rounded-2xl border border-line bg-white p-6 xl:sticky xl:top-24">
                <h2 className="text-sm font-bold text-ink">Profile use</h2>
                <ul className="mt-3 grid gap-2 text-sm leading-6 text-ink-muted">
                  <li>Shown on public campaign pages</li>
                  <li>Tied to the connected merchant wallet</li>
                  <li>Editable without changing contract terms</li>
                </ul>
                <NotificationEmailForm />
              </aside>
            </div>
          )}

          {page === "redeem-pass" && (dashboard.merchant ? <RedemptionScanner config={config} /> : <MerchantSetupRequired />)}

          {page === "create-campaign" && (
            dashboard.merchant ? (
              <section aria-labelledby="create-campaign-heading" className="rounded-2xl border border-line bg-white">
                <div className="border-b border-line px-6 py-5 sm:px-7">
                  <h2 id="create-campaign-heading" className="font-bold text-ink">Campaign terms</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">
                    Public details are stored off-chain. Supply, pricing, expiration, and fund distribution are enforced on Stellar.
                  </p>
                </div>
                <div className="p-6 sm:p-7"><CampaignForm config={config} onPublished={loadDashboard} /></div>
              </section>
            ) : <MerchantSetupRequired />
          )}
        </div>
    </div>
  );
}
