"use client";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CircleDollarSign,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Rocket,
  ScanLine,
  Settings2,
  ShieldCheck,
  Store,
  TicketCheck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CampaignCard } from "@/components/merchant/campaign-card";
import { CampaignForm } from "@/components/merchant/campaign-form";
import { MerchantProfileForm } from "@/components/merchant/profile-form";
import { RedemptionScanner } from "@/components/merchant/redemption-scanner";
import { NotificationEmailForm } from "@/components/notifications/notification-email-form";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

const merchantActions = [
  {
    href: "/merchant/business-identity",
    eyebrow: "Profile",
    title: "Business identity",
    description: "Create or update the business information customers see on shared campaigns.",
    icon: Store,
    actionIcon: Settings2,
    actionLabel: "Manage profile",
    cardClass: "border-line border-l-4 border-l-forest bg-white hover:border-forest/35",
    iconClass: "bg-mint-soft text-forest",
    eyebrowClass: "text-forest",
    titleClass: "text-ink",
    descriptionClass: "text-ink-muted",
    actionClass: "bg-forest text-white",
  },
  {
    href: "/merchant/redeem-pass",
    eyebrow: "Fulfillment",
    title: "Redeem a customer pass",
    description: "Scan a customer QR and prepare the owner-authorized redemption flow.",
    icon: ScanLine,
    actionIcon: Camera,
    actionLabel: "Open scanner",
    cardClass: "border-ink bg-ink hover:border-mint/45",
    iconClass: "bg-white/10 text-mint",
    eyebrowClass: "text-mint",
    titleClass: "text-white",
    descriptionClass: "text-white/65",
    actionClass: "bg-white text-ink",
  },
  {
    href: "/merchant/create-campaign",
    eyebrow: "Working capital",
    title: "Create a limited future-service campaign",
    description: "Define service value, fixed supply, expiration, and contract financial terms.",
    icon: Rocket,
    actionIcon: Plus,
    actionLabel: "Create campaign",
    cardClass: "border-coral/35 bg-coral-soft hover:border-coral",
    iconClass: "bg-white text-coral-strong",
    eyebrowClass: "text-coral-strong",
    titleClass: "text-ink",
    descriptionClass: "text-ink-muted",
    actionClass: "bg-coral-strong text-white",
  },
] as const;

const pageCopy: Record<Exclude<MerchantWorkspacePage, "overview">, { eyebrow: string; title: string; description: string }> = {
  "business-identity": {
    eyebrow: "Merchant profile",
    title: "Business identity",
    description: "Manage the public business information shown to customers on every campaign.",
  },
  "redeem-pass": {
    eyebrow: "Pass fulfillment",
    title: "Redeem a customer pass",
    description: "Scan the pass, approve as the merchant, and wait for the current owner to authorize redemption.",
  },
  "create-campaign": {
    eyebrow: "Campaign setup",
    title: "Create a limited future-service campaign",
    description: "Configure and publish a fixed-supply campaign backed by real service value.",
  },
};

function MerchantSetupRequired() {
  return (
    <Card className="p-8 text-center sm:p-10">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-mint-soft text-forest">
        <Store aria-hidden="true" className="size-5" />
      </span>
      <h2 className="mt-5 text-xl font-extrabold tracking-tight text-ink">Complete your business identity first</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink-muted">
        WrenPass needs a merchant profile before campaigns can be published or customer passes redeemed.
      </p>
      <Link className={buttonStyles({ className: "mt-5", size: "sm" })} href="/merchant/business-identity">
        Set up business identity
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </Card>
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
        setSyncWarning("On-chain data is current, but durable event and email sync will retry later.");
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
          () => active && setSyncWarning("On-chain data is current, but durable event and email sync will retry later."),
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
      <Card className="mx-auto max-w-2xl p-8 text-center sm:p-12">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-mint-soft text-forest"><Store aria-hidden="true" className="size-6" /></span>
        <h2 className="mt-6 text-2xl font-extrabold tracking-tight text-ink">Connect your merchant wallet</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-ink-muted">Freighter verifies which campaigns belong to you and authorizes every on-chain merchant action. WrenPass never requests your secret key.</p>
        {walletError && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{walletError}</p>}
        <Button className="mt-6" onClick={() => void connect()}>Connect Freighter</Button>
      </Card>
    );
  }

  if (loadedAddress !== address || (loading && !dashboard)) return <LoadingState className="min-h-[28rem]" label="Loading merchant workspace" />;
  if (error && !dashboard) return <ErrorState description={error} onRetry={() => void loadDashboard()} />;
  if (!dashboard) return null;

  const stats = [
    { label: "USDC raised", value: displayUsdc(totals.raised), icon: CircleDollarSign },
    { label: "Passes sold", value: String(totals.sold), icon: TicketCheck },
    { label: "Passes remaining", value: String(totals.remaining), icon: Plus },
    { label: "Passes redeemed", value: String(totals.redeemed), icon: TicketCheck },
    { label: "Merchant funds released", value: displayUsdc(totals.merchantFunds), icon: CircleDollarSign },
    { label: "Protected funds", value: displayUsdc(totals.protectedFunds), icon: ShieldCheck },
  ];
  const activePageCopy = page === "overview" ? null : pageCopy[page];

  return (
    <div className="grid gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {page !== "overview" && (
            <Link className={buttonStyles({ className: "-ml-3 mb-3", size: "sm", variant: "ghost" })} href="/merchant">
              <ArrowLeft aria-hidden="true" className="size-4" />
              Merchant overview
            </Link>
          )}
          <p className="eyebrow">{activePageCopy?.eyebrow ?? "Merchant workspace"}</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-ink sm:text-4xl">
            {activePageCopy?.title ?? dashboard.merchant?.businessName ?? "Set up your business"}
          </h1>
          {activePageCopy && <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">{activePageCopy.description}</p>}
          <p className="mt-2 text-sm font-semibold text-ink-muted">Authenticated as {shortenStellarAddress(address)} · {config.network === "testnet" ? "Stellar Testnet" : "Stellar Mainnet"}</p>
        </div>
        <Button disabled={loading} size="sm" variant="secondary" onClick={() => void loadDashboard()}>
          {loading ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCcw aria-hidden="true" className="size-4" />}
          Refresh on-chain data
        </Button>
      </div>

      {error && <ErrorState description={error} onRetry={() => void loadDashboard()} />}
      {syncWarning && <p role="status" className="rounded-2xl border border-coral/25 bg-coral-soft p-4 text-sm font-semibold text-ink-muted">{syncWarning}</p>}

      {page === "overview" && (
        <>
          <section aria-labelledby="merchant-actions-heading">
            <div>
              <p className="eyebrow">Merchant tools</p>
              <h2 id="merchant-actions-heading" className="mt-3 text-2xl font-extrabold tracking-tight text-ink">Choose what you want to manage</h2>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {merchantActions.map(({
                actionClass,
                actionIcon: ActionIcon,
                actionLabel,
                cardClass,
                description,
                descriptionClass,
                eyebrow,
                eyebrowClass,
                href,
                icon: Icon,
                iconClass,
                title,
                titleClass,
              }) => (
                <Link
                  className={`group flex min-h-64 flex-col rounded-3xl border p-6 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-dialog focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest ${cardClass}`}
                  href={href}
                  key={href}
                >
                  <span className={`grid size-12 place-items-center rounded-2xl ${iconClass}`}><Icon aria-hidden="true" className="size-5" /></span>
                  <p className={`mt-6 text-xs font-extrabold uppercase tracking-[0.12em] ${eyebrowClass}`}>{eyebrow}</p>
                  <h3 className={`mt-2 text-xl font-extrabold tracking-tight ${titleClass}`}>{title}</h3>
                  <p className={`mt-2 text-sm leading-6 ${descriptionClass}`}>{description}</p>
                  <span className={`mt-auto inline-flex w-fit items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-transform group-hover:translate-x-0.5 ${actionClass}`}>
                    <ActionIcon aria-hidden="true" className="size-4" />
                    {actionLabel}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {dashboard.merchant && (
            <>
              <section aria-label="Campaign performance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {stats.map(({ icon: Icon, label, value }) => (
                  <Card className="p-5" key={label}>
                    <div className="flex items-start justify-between gap-4">
                      <div><p className="text-sm font-semibold text-ink-muted">{label}</p><p className="mt-2 text-2xl font-extrabold tracking-tight text-ink">{value}</p></div>
                      <span className="grid size-10 place-items-center rounded-xl bg-mint-soft text-forest"><Icon aria-hidden="true" className="size-4" /></span>
                    </div>
                  </Card>
                ))}
              </section>

              <section aria-labelledby="campaigns-heading">
                <div className="flex items-end justify-between gap-4">
                  <div><p className="eyebrow">Your campaigns</p><h2 id="campaigns-heading" className="mt-3 text-2xl font-extrabold tracking-tight text-ink">Share and monitor</h2></div>
                  <p className="text-sm font-semibold text-ink-muted">{dashboard.campaigns.length} total</p>
                </div>
                {dashboard.campaigns.length ? (
                  <div className="mt-6 grid gap-5 lg:grid-cols-2">{dashboard.campaigns.map((campaign) => <CampaignCard campaign={campaign} key={campaign.onchain.id} />)}</div>
                ) : (
                  <Card className="mt-6 p-8 text-center"><p className="font-bold text-ink">No campaigns yet</p><p className="mt-2 text-sm text-ink-muted">Create your first campaign from the campaign setup page.</p></Card>
                )}
              </section>
            </>
          )}
        </>
      )}

      {page === "business-identity" && (
        <>
          <section aria-labelledby="merchant-profile-heading">
            <Card className="grid overflow-hidden lg:grid-cols-[0.72fr_1.28fr]">
              <div className="bg-ink p-7 text-white sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-mint">Business identity</p>
                <h2 id="merchant-profile-heading" className="mt-4 text-2xl font-extrabold tracking-tight">Your public merchant profile</h2>
                <p className="mt-3 text-sm leading-6 text-white/65">Customers see this information on every campaign you share. Your connected wallet remains the owner.</p>
              </div>
              <div className="p-7 sm:p-8">
                <MerchantProfileForm merchant={dashboard.merchant} onSaved={(merchant) => setDashboard((current) => current ? { ...current, merchant } : current)} />
              </div>
            </Card>
          </section>
          <NotificationEmailForm />
        </>
      )}

      {page === "redeem-pass" && (dashboard.merchant ? <RedemptionScanner config={config} /> : <MerchantSetupRequired />)}

      {page === "create-campaign" && (
        dashboard.merchant ? (
          <section aria-labelledby="create-campaign-heading">
            <Card className="p-7 sm:p-8">
              <div className="max-w-2xl">
                <p className="eyebrow">Raise working capital</p>
                <h2 id="create-campaign-heading" className="mt-3 text-2xl font-extrabold tracking-tight text-ink">Campaign terms</h2>
                <p className="mt-2 text-sm leading-6 text-ink-muted">The wallet owns the financial campaign on Stellar. Firestore stores only the descriptive details and optional image used by this interface.</p>
              </div>
              <div className="mt-7 border-t border-line pt-7"><CampaignForm config={config} onPublished={loadDashboard} /></div>
            </Card>
          </section>
        ) : <MerchantSetupRequired />
      )}
    </div>
  );
}
