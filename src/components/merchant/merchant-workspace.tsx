"use client";

import { CircleDollarSign, LoaderCircle, Plus, RefreshCcw, ShieldCheck, Store, TicketCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CampaignCard } from "@/components/merchant/campaign-card";
import { CampaignForm } from "@/components/merchant/campaign-form";
import { MerchantProfileForm } from "@/components/merchant/profile-form";
import { RedemptionScanner } from "@/components/merchant/redemption-scanner";
import { NotificationEmailForm } from "@/components/notifications/notification-email-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/feedback-state";
import { useWallet } from "@/components/wallet/wallet-provider";
import { merchantApi } from "@/features/merchant/api";
import { notificationApi } from "@/features/notifications/api";
import { displayUsdc, shortenStellarAddress } from "@/features/merchant/display";
import type { MerchantDashboardDto } from "@/features/merchant/dto";
import type { StellarConfig } from "@/lib/stellar/config";

export function MerchantWorkspace({ config }: { config: StellarConfig }) {
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

  return (
    <div className="grid gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Merchant workspace</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-ink sm:text-4xl">{dashboard.merchant?.businessName ?? "Set up your business"}</h1>
          <p className="mt-2 text-sm font-semibold text-ink-muted">Authenticated as {shortenStellarAddress(address)} · {config.network === "testnet" ? "Stellar Testnet" : "Stellar Mainnet"}</p>
        </div>
        <Button disabled={loading} size="sm" variant="secondary" onClick={() => void loadDashboard()}>
          {loading ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCcw aria-hidden="true" className="size-4" />}
          Refresh on-chain data
        </Button>
      </div>

      {error && <ErrorState description={error} onRetry={() => void loadDashboard()} />}
      {syncWarning && <p role="status" className="rounded-2xl border border-coral/25 bg-coral-soft p-4 text-sm font-semibold text-ink-muted">{syncWarning}</p>}

      {dashboard.merchant && <RedemptionScanner config={config} />}

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

          <section aria-labelledby="create-campaign-heading">
            <Card className="p-7 sm:p-8">
              <div className="max-w-2xl">
                <p className="eyebrow">Raise working capital</p>
                <h2 id="create-campaign-heading" className="mt-3 text-2xl font-extrabold tracking-tight text-ink">Create a limited future-service campaign</h2>
                <p className="mt-2 text-sm leading-6 text-ink-muted">The wallet owns the financial campaign on Stellar. Firestore stores only the name, description, and optional image used by this interface.</p>
              </div>
              <div className="mt-7 border-t border-line pt-7"><CampaignForm config={config} onPublished={loadDashboard} /></div>
            </Card>
          </section>

          <section aria-labelledby="campaigns-heading">
            <div className="flex items-end justify-between gap-4">
              <div><p className="eyebrow">Your campaigns</p><h2 id="campaigns-heading" className="mt-3 text-2xl font-extrabold tracking-tight text-ink">Share and monitor</h2></div>
              <p className="text-sm font-semibold text-ink-muted">{dashboard.campaigns.length} total</p>
            </div>
            {dashboard.campaigns.length ? (
              <div className="mt-6 grid gap-5 lg:grid-cols-2">{dashboard.campaigns.map((campaign) => <CampaignCard campaign={campaign} key={campaign.onchain.id} />)}</div>
            ) : (
              <Card className="mt-6 p-8 text-center"><p className="font-bold text-ink">No campaigns yet</p><p className="mt-2 text-sm text-ink-muted">Your first campaign will appear here after both wallet approvals complete.</p></Card>
            )}
          </section>
        </>
      )}

      <NotificationEmailForm />
    </div>
  );
}
