"use client";

import { ExternalLink, LoaderCircle, RefreshCcw, TicketCheck, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CustomerPassCard } from "@/components/customer/customer-pass-card";
import { RedemptionRequests } from "@/components/customer/redemption-requests";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/feedback-state";
import { useWallet } from "@/components/wallet/wallet-provider";
import { customerApi } from "@/features/customer/api";
import type {
  CustomerActivityDto,
  CustomerPassDto,
  CustomerPassStatusDto,
} from "@/features/customer/dto";
import { displayUsdc, shortenStellarAddress } from "@/features/merchant/display";
import type { StellarConfig, StellarNetwork } from "@/lib/stellar/config";
import { stellarTransactionUrl } from "@/lib/stellar/explorer";

const passTabs: Array<{ label: string; status: CustomerPassStatusDto }> = [
  { label: "Active", status: "Active" },
  { label: "Redeemed", status: "Redeemed" },
  { label: "Expired", status: "Expired" },
  { label: "Refunded", status: "Refunded" },
];

type WorkspaceSection = "owned" | "activity";

const activityLabels: Record<CustomerActivityDto["kind"], string> = {
  Purchased: "Purchased",
  Gifted: "Gifted",
  Received: "Received",
  Redeemed: "Redeemed",
  Refunded: "Refunded",
};

function ActivityTable({
  activity,
  network,
}: {
  activity: CustomerActivityDto[];
  network: StellarNetwork;
}) {
  if (!activity.length) {
    return (
      <div className="rounded-card border border-dashed border-line bg-white px-6 py-10 text-center">
        <p className="font-semibold text-ink">No recent activity</p>
        <p className="mt-1 text-sm text-ink-muted">Retained purchase, transfer, redemption, and refund events appear here.</p>
      </div>
    );
  }

  const sortedActivity = [...activity].sort(
    (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
  );

  return (
    <div className="overflow-hidden rounded-card border border-line bg-white">
      <div className="hidden grid-cols-[0.75fr_0.75fr_0.85fr_minmax(0,1fr)_1fr] gap-4 border-b border-line bg-canvas px-5 py-3 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-ink-faint md:grid">
        <span>Type</span><span>Pass</span><span>Campaign</span><span>Details</span><span>Date</span>
      </div>
      {sortedActivity.map((item) => {
        const counterpartyLabel = item.kind === "Gifted" ? "To" : "From";
        return (
          <div
            className="grid gap-3 border-b border-line px-5 py-4 text-sm last:border-b-0 md:grid-cols-[0.75fr_0.75fr_0.85fr_minmax(0,1fr)_1fr] md:items-center md:gap-4"
            key={item.id}
          >
            <div className="flex items-center justify-between md:block">
              <span className="text-xs font-semibold text-ink-faint md:hidden">Type</span>
              <span className="font-semibold text-ink">{activityLabels[item.kind]}</span>
            </div>
            <div className="flex items-center justify-between md:block">
              <span className="text-xs font-semibold text-ink-faint md:hidden">Pass</span>
              <span className="font-mono text-xs text-ink">#{item.passId}</span>
            </div>
            <div className="flex items-center justify-between md:block">
              <span className="text-xs font-semibold text-ink-faint md:hidden">Campaign</span>
              <span className="font-mono text-xs text-ink">#{item.campaignId}</span>
            </div>
            <div className="flex items-center justify-between gap-4 md:block">
              <span className="text-xs font-semibold text-ink-faint md:hidden">Details</span>
              <span className="flex flex-col items-end gap-1 text-right text-xs text-ink-muted md:items-start md:text-left">
                {item.amount
                  ? displayUsdc(item.amount)
                  : item.counterparty
                    ? `${counterpartyLabel} ${shortenStellarAddress(item.counterparty)}`
                    : "—"}
                <a
                  className="inline-flex items-center gap-1 font-semibold text-forest hover:text-forest-strong"
                  href={stellarTransactionUrl(network, item.transactionHash)}
                  rel="noreferrer"
                  target="_blank"
                >
                  View on-chain <ExternalLink aria-hidden="true" className="size-3" />
                </a>
              </span>
            </div>
            <div className="flex items-center justify-between md:block">
              <span className="text-xs font-semibold text-ink-faint md:hidden">Date</span>
              <span className="text-xs text-ink-muted">
                {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.occurredAt))}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CustomerWorkspace({ config }: { config: StellarConfig }) {
  const { address, connect, error: walletError, status } = useWallet();
  const [passes, setPasses] = useState<CustomerPassDto[] | null>(null);
  const [loadedAddress, setLoadedAddress] = useState<string | null>(null);
  const [activity, setActivity] = useState<CustomerActivityDto[] | null>(null);
  const [activityWindowStartsAt, setActivityWindowStartsAt] = useState<string | null>(null);
  const [activityLoadedAddress, setActivityLoadedAddress] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<CustomerPassStatusDto>("Active");
  const [selectedSection, setSelectedSection] = useState<WorkspaceSection>("owned");
  const [loading, setLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [loadError, setLoadError] = useState<{ address: string; message: string } | null>(null);
  const [activityError, setActivityError] = useState<{ address: string; message: string } | null>(null);
  const passRequestId = useRef(0);
  const activityRequestId = useRef(0);
  const error = loadError?.address === address ? loadError.message : null;
  const currentActivityError = activityError?.address === address ? activityError.message : null;

  const loadPasses = useCallback(async (
    options: { signal?: AbortSignal; refresh?: boolean } = {},
  ) => {
    if (status !== "connected" || !address) return;
    const currentRequestId = passRequestId.current + 1;
    passRequestId.current = currentRequestId;
    setLoading(true);
    setLoadError(null);
    try {
      const nextPasses = await customerApi.getPasses(address, options);
      if (options.signal?.aborted || passRequestId.current !== currentRequestId) return;
      setPasses(nextPasses.passes);
      setLoadedAddress(address);
    } catch (loadError) {
      if (options.signal?.aborted || passRequestId.current !== currentRequestId) return;
      setLoadError({
        address,
        message: loadError instanceof Error ? loadError.message : "Unable to load your passes.",
      });
    } finally {
      if (passRequestId.current === currentRequestId) setLoading(false);
    }
  }, [address, status]);

  const loadActivity = useCallback(async (
    options: { signal?: AbortSignal; refresh?: boolean } = {},
  ) => {
    if (status !== "connected" || !address) return;
    const currentRequestId = activityRequestId.current + 1;
    activityRequestId.current = currentRequestId;
    setActivityLoading(true);
    setActivityError(null);
    try {
      const nextActivity = await customerApi.getActivity(address, options);
      if (options.signal?.aborted || activityRequestId.current !== currentRequestId) return;
      setActivity(nextActivity.activity);
      setActivityWindowStartsAt(nextActivity.activityWindowStartsAt);
      setActivityLoadedAddress(address);
    } catch (loadActivityError) {
      if (options.signal?.aborted || activityRequestId.current !== currentRequestId) return;
      setActivityError({
        address,
        message: loadActivityError instanceof Error
          ? loadActivityError.message
          : "Unable to load recent activity.",
      });
    } finally {
      if (activityRequestId.current === currentRequestId) setActivityLoading(false);
    }
  }, [address, status]);

  useEffect(() => {
    if (status !== "connected" || !address) return;
    const controller = new AbortController();
    const currentRequestId = passRequestId.current + 1;
    passRequestId.current = currentRequestId;
    void customerApi.getPasses(address, { signal: controller.signal }).then(
      (nextPasses) => {
        if (controller.signal.aborted || passRequestId.current !== currentRequestId) return;
        setPasses(nextPasses.passes);
        setLoadedAddress(address);
        setLoadError(null);
      },
      (initialLoadError: unknown) => {
        if (controller.signal.aborted || passRequestId.current !== currentRequestId) return;
        setLoadError({
          address,
          message: initialLoadError instanceof Error
            ? initialLoadError.message
            : "Unable to load your passes.",
        });
      },
    );
    return () => {
      controller.abort();
      passRequestId.current += 1;
    };
  }, [address, status]);

  useEffect(() => {
    if (
      selectedSection !== "activity" ||
      status !== "connected" ||
      !address ||
      activityLoadedAddress === address
    ) return;

    const controller = new AbortController();
    const currentRequestId = activityRequestId.current + 1;
    activityRequestId.current = currentRequestId;
    void customerApi.getActivity(address, { signal: controller.signal })
      .then(
        (nextActivity) => {
          if (controller.signal.aborted || activityRequestId.current !== currentRequestId) return;
          setActivity(nextActivity.activity);
          setActivityWindowStartsAt(nextActivity.activityWindowStartsAt);
          setActivityLoadedAddress(address);
          setActivityError(null);
        },
        (loadActivityError: unknown) => {
          if (controller.signal.aborted || activityRequestId.current !== currentRequestId) return;
          setActivityError({
            address,
            message: loadActivityError instanceof Error
              ? loadActivityError.message
              : "Unable to load recent activity.",
          });
        },
      )
      .finally(() => {
        if (activityRequestId.current === currentRequestId) setActivityLoading(false);
      });
    return () => {
      controller.abort();
      activityRequestId.current += 1;
    };
  }, [activityLoadedAddress, address, selectedSection, status]);

  const passCounts = useMemo(() => {
    const counts: Record<CustomerPassStatusDto, number> = { Active: 0, Redeemed: 0, Expired: 0, Refunded: 0 };
    for (const pass of passes ?? []) counts[pass.status] += 1;
    return counts;
  }, [passes]);

  if (status === "checking") return <LoadingState className="min-h-[28rem]" label="Checking your wallet session" />;

  if (status !== "connected" || !address) {
    return (
      <section className="mx-auto max-w-xl rounded-card border border-line bg-white p-8 text-center sm:p-10">
        <WalletCards aria-hidden="true" className="mx-auto size-6 text-forest" />
        <h2 className="mt-5 text-xl font-bold tracking-tight text-ink">Connect your customer wallet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">
          Connect the wallet that purchased or received the passes you want to manage.
        </p>
        {walletError && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{walletError}</p>}
        <Button className="mt-6" onClick={() => void connect()}>Connect Freighter</Button>
      </section>
    );
  }

  if (error && (loadedAddress !== address || !passes)) {
    return <ErrorState description={error} onRetry={() => void loadPasses()} />;
  }
  if (loadedAddress !== address || (loading && !passes)) {
    return <LoadingState className="min-h-[28rem]" label="Reading passes from Stellar" />;
  }
  if (!passes) return null;

  const visiblePasses = passes.filter((pass) => pass.status === selectedStatus);
  const refreshing = selectedSection === "activity" ? activityLoading : loading;

  return (
    <div className="min-w-0">
      <header className="flex flex-col gap-5 border-b border-line pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-coral-strong">Customer workspace</p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-ink sm:text-3xl">My passes</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Manage current ownership, approvals, transfers, and activity.</p>
          <p className="mt-2 text-xs font-semibold text-ink-faint">
            {shortenStellarAddress(address)} · {config.network === "testnet" ? "Stellar Testnet" : "Stellar Mainnet"}
          </p>
        </div>
        <Button
          disabled={refreshing}
          size="sm"
          variant="secondary"
          onClick={() => void (
            selectedSection === "activity"
              ? loadActivity({ refresh: true })
              : loadPasses({ refresh: true })
          )}
        >
          {refreshing ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCcw aria-hidden="true" className="size-4" />}
          Refresh
        </Button>
      </header>

      <nav aria-label="My passes sections" className="mt-5 grid grid-cols-2 rounded-xl border border-line bg-white p-1 text-center text-xs font-bold text-ink-muted sm:inline-grid sm:w-auto sm:grid-cols-2 sm:text-sm" role="tablist">
        {[
          { id: "owned" as const, label: "Owned Passes", controls: "owned-passes" },
          { id: "activity" as const, label: "Activity", controls: "activity" },
        ].map((tab) => (
          <button
            aria-controls={tab.controls}
            aria-selected={selectedSection === tab.id}
            className={`rounded-lg px-3 py-2.5 transition ${selectedSection === tab.id ? "bg-forest text-white shadow-sm" : "hover:bg-sage-soft hover:text-ink"}`}
            key={tab.id}
            role="tab"
            type="button"
            onClick={() => {
              if (tab.id === "activity" && activityLoadedAddress !== address) {
                setActivityLoading(true);
              }
              setSelectedSection(tab.id);
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="mt-7 grid gap-8">
        {error && <ErrorState description={error} onRetry={() => void loadPasses()} />}

        {selectedSection === "owned" ? (
          <>
            <section aria-label="Pass status summary" className="overflow-hidden rounded-card border border-line bg-white">
              <div className="grid grid-cols-2 sm:grid-cols-4">
                {passTabs.map((tab, index) => (
                  <button
                    aria-label={`${tab.label} passes: ${passCounts[tab.status]}`}
                    aria-pressed={selectedStatus === tab.status}
                    className={`${index % 2 ? "border-l border-line" : ""} ${index >= 2 ? "border-t border-line sm:border-t-0" : ""} ${index > 0 ? "sm:border-l sm:border-line" : ""} p-4 text-left transition-colors hover:bg-sage-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-forest sm:p-5 ${selectedStatus === tab.status ? "bg-mint-soft" : "bg-white"}`}
                    key={tab.status}
                    type="button"
                    onClick={() => setSelectedStatus(tab.status)}
                  >
                    <span className="text-xs font-semibold text-ink-muted">{tab.label}</span>
                    <span className="mt-2 block text-2xl font-bold tracking-tight text-ink">{passCounts[tab.status]}</span>
                  </button>
                ))}
              </div>
            </section>

            <RedemptionRequests config={config} onRedeemed={() => loadPasses({ refresh: true })} />

            <section id="owned-passes" aria-labelledby="owned-passes-heading" className="min-w-0">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 id="owned-passes-heading" className="text-lg font-bold tracking-tight text-ink">Owned passes</h2>
                  <p className="mt-1 text-sm text-ink-muted">Passes currently held by this wallet, grouped by status.</p>
                </div>
                <div className="sm:hidden">
                  <label className="sr-only" htmlFor="mobile-pass-status">Pass status</label>
                  <select
                    id="mobile-pass-status"
                    className="h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm font-bold text-ink outline-none focus:border-forest focus:ring-3 focus:ring-forest/10"
                    value={selectedStatus}
                    onChange={(event) => setSelectedStatus(event.target.value as CustomerPassStatusDto)}
                  >
                    {passTabs.map((tab) => <option key={tab.status} value={tab.status}>{tab.label} ({passCounts[tab.status]})</option>)}
                  </select>
                </div>
                <div className="hidden flex-wrap gap-1 rounded-lg border border-line bg-white p-1 sm:flex" role="tablist" aria-label="Pass status">
                  {passTabs.map((tab) => (
                    <button
                      key={tab.status}
                      role="tab"
                      aria-selected={selectedStatus === tab.status}
                      className={`rounded-md px-3 py-1.5 text-sm font-bold transition ${selectedStatus === tab.status ? "bg-forest text-white" : "text-ink-muted hover:bg-sage-soft hover:text-ink"}`}
                      onClick={() => setSelectedStatus(tab.status)}
                    >
                      {tab.label} <span className="ml-1 opacity-70">{passCounts[tab.status]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {visiblePasses.length ? (
                <div className="mt-4 grid gap-3">
                  {visiblePasses.map((pass) => <CustomerPassCard config={config} key={pass.id} pass={pass} onGifted={() => loadPasses({ refresh: true })} />)}
                </div>
              ) : (
                <div className="mt-4 rounded-card border border-dashed border-line bg-white px-6 py-10 text-center">
                  <TicketCheck aria-hidden="true" className="mx-auto size-5 text-forest" />
                  <p className="mt-3 font-semibold text-ink">No {selectedStatus.toLowerCase()} passes</p>
                  <p className="mt-1 text-sm text-ink-muted">Passes in this state will appear from current on-chain ownership.</p>
                </div>
              )}
            </section>
          </>
        ) : (
          <section id="activity" aria-labelledby="activity-heading">
            <div>
              <h2 id="activity-heading" className="text-lg font-bold tracking-tight text-ink">Recent activity</h2>
              {activityWindowStartsAt && (
                <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">
                  Retained contract events since {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(activityWindowStartsAt))}.
                </p>
              )}
            </div>
            <div className="mt-4">
              {currentActivityError ? (
                <ErrorState description={currentActivityError} onRetry={() => void loadActivity()} />
              ) : activityLoading || activityLoadedAddress !== address || !activity ? (
                <LoadingState className="min-h-48 rounded-card border border-line bg-white" label="Reading recent activity from Stellar" />
              ) : (
                <ActivityTable activity={activity} network={config.network} />
              )}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
