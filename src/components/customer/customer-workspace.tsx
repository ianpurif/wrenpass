"use client";

import { ArrowDownLeft, Gift, History, LoaderCircle, RefreshCcw, TicketCheck, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CustomerPassCard } from "@/components/customer/customer-pass-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/feedback-state";
import { useWallet } from "@/components/wallet/wallet-provider";
import { customerApi } from "@/features/customer/api";
import type {
  CustomerActivityDto,
  CustomerDashboardDto,
  CustomerPassStatusDto,
} from "@/features/customer/dto";
import { displayUsdc, shortenStellarAddress } from "@/features/merchant/display";
import type { StellarConfig } from "@/lib/stellar/config";

const passTabs: Array<{ label: string; status: CustomerPassStatusDto }> = [
  { label: "Active", status: "Active" },
  { label: "Redeemed", status: "Redeemed" },
  { label: "Expired", status: "Expired" },
  { label: "Refunded", status: "Refunded" },
];

function ActivityList({
  activity,
  emptyLabel,
  kind,
}: {
  activity: CustomerActivityDto[];
  emptyLabel: string;
  kind: CustomerActivityDto["kind"];
}) {
  const items = activity.filter((item) => item.kind === kind);
  if (!items.length) return <p className="mt-4 text-sm text-ink-faint">{emptyLabel}</p>;
  return (
    <div className="mt-4 grid gap-3">
      {items.map((item) => (
        <div className="rounded-2xl border border-line bg-canvas p-4" key={item.id}>
          <div className="flex items-start justify-between gap-3">
            <div><p className="font-bold text-ink">Pass #{item.passId}</p><p className="mt-1 text-xs font-semibold text-ink-muted">Campaign #{item.campaignId}</p></div>
            {item.amount && <span className="text-sm font-extrabold text-ink">{displayUsdc(item.amount)}</span>}
          </div>
          {item.counterparty && <p className="mt-2 text-xs text-ink-muted">{kind === "Gifted" ? "To" : "From"} {shortenStellarAddress(item.counterparty)}</p>}
          <p className="mt-2 text-xs text-ink-faint">{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.occurredAt))}</p>
        </div>
      ))}
    </div>
  );
}

export function CustomerWorkspace({ config }: { config: StellarConfig }) {
  const { address, connect, error: walletError, status } = useWallet();
  const [dashboard, setDashboard] = useState<CustomerDashboardDto | null>(null);
  const [loadedAddress, setLoadedAddress] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<CustomerPassStatusDto>("Active");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      setDashboard(await customerApi.getDashboard());
      setLoadedAddress(address);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load your passes.");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    let active = true;
    customerApi.getDashboard().then(
      (nextDashboard) => {
        if (!active) return;
        setDashboard(nextDashboard);
        setLoadedAddress(address);
        setError(null);
      },
      (loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load your passes.");
      },
    );
    return () => {
      active = false;
    };
  }, [address]);

  const passCounts = useMemo(() => {
    const counts: Record<CustomerPassStatusDto, number> = { Active: 0, Redeemed: 0, Expired: 0, Refunded: 0 };
    for (const pass of dashboard?.passes ?? []) counts[pass.status] += 1;
    return counts;
  }, [dashboard]);

  if (status === "checking") return <LoadingState className="min-h-[28rem]" label="Checking your wallet session" />;

  if (status !== "connected" || !address) {
    return (
      <Card className="mx-auto max-w-2xl p-8 text-center sm:p-12">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-mint-soft text-forest"><WalletCards aria-hidden="true" className="size-6" /></span>
        <h2 className="mt-6 text-2xl font-extrabold tracking-tight text-ink">Connect your customer wallet</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-ink-muted">WrenPass reads current pass ownership directly from the contract. Connect the wallet that purchased or received the pass.</p>
        {walletError && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{walletError}</p>}
        <Button className="mt-6" onClick={() => void connect()}>Connect Freighter</Button>
      </Card>
    );
  }

  if (loadedAddress !== address || (loading && !dashboard)) return <LoadingState className="min-h-[28rem]" label="Reading passes from Stellar" />;
  if (error && !dashboard) return <ErrorState description={error} onRetry={() => void loadDashboard()} />;
  if (!dashboard) return null;

  const visiblePasses = dashboard.passes.filter((pass) => pass.status === selectedStatus);

  return (
    <div className="grid gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="eyebrow">Customer passes</p><h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-ink sm:text-4xl">Your WrenPass wallet</h1><p className="mt-2 text-sm font-semibold text-ink-muted">{shortenStellarAddress(address)} · {config.network === "testnet" ? "Stellar Testnet" : "Stellar Mainnet"}</p></div>
        <Button disabled={loading} size="sm" variant="secondary" onClick={() => void loadDashboard()}>{loading ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCcw aria-hidden="true" className="size-4" />}Refresh on-chain data</Button>
      </div>
      {error && <ErrorState description={error} onRetry={() => void loadDashboard()} />}

      <section aria-labelledby="owned-passes-heading">
        <div><p className="eyebrow">Current ownership</p><h2 id="owned-passes-heading" className="mt-3 text-2xl font-extrabold tracking-tight text-ink">Passes held by this wallet</h2></div>
        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Pass status">
          {passTabs.map((tab) => (
            <button key={tab.status} role="tab" aria-selected={selectedStatus === tab.status} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${selectedStatus === tab.status ? "bg-forest text-white" : "border border-line bg-white text-ink-muted hover:border-forest/30"}`} onClick={() => setSelectedStatus(tab.status)}>{tab.label} <span className="ml-1 opacity-70">{passCounts[tab.status]}</span></button>
          ))}
        </div>
        {visiblePasses.length ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">{visiblePasses.map((pass) => <CustomerPassCard config={config} key={pass.id} pass={pass} onGifted={loadDashboard} />)}</div>
        ) : (
          <Card className="mt-6 p-8 text-center"><TicketCheck aria-hidden="true" className="mx-auto size-6 text-forest" /><p className="mt-4 font-bold text-ink">No {selectedStatus.toLowerCase()} passes</p><p className="mt-2 text-sm text-ink-muted">Passes in this state will appear here from current on-chain ownership.</p></Card>
        )}
      </section>

      <section aria-labelledby="activity-heading">
        <div><p className="eyebrow">Recent contract events</p><h2 id="activity-heading" className="mt-3 text-2xl font-extrabold tracking-tight text-ink">Purchase and transfer history</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">This live RPC view covers events retained since {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(dashboard.activityWindowStartsAt))}. Phase 9 adds durable, idempotent event indexing.</p></div>
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <Card className="p-6"><History aria-hidden="true" className="size-5 text-forest" /><h3 className="mt-4 font-extrabold text-ink">Purchase history</h3><ActivityList activity={dashboard.activity} emptyLabel="No retained purchase events." kind="Purchased" /></Card>
          <Card className="p-6"><Gift aria-hidden="true" className="size-5 text-forest" /><h3 className="mt-4 font-extrabold text-ink">Gifted passes</h3><ActivityList activity={dashboard.activity} emptyLabel="No retained outgoing gifts." kind="Gifted" /></Card>
          <Card className="p-6"><ArrowDownLeft aria-hidden="true" className="size-5 text-forest" /><h3 className="mt-4 font-extrabold text-ink">Received passes</h3><ActivityList activity={dashboard.activity} emptyLabel="No retained received gifts." kind="Received" /></Card>
        </div>
      </section>
    </div>
  );
}
