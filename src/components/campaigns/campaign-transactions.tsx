"use client";

import { ExternalLink, LoaderCircle } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback-state";
import { campaignTransactionsApi } from "@/features/campaign-transactions/api";
import type { CampaignTransactionPageDto } from "@/features/campaign-transactions/dto";
import { displayUsdc } from "@/features/merchant/display";
import type { StellarNetwork } from "@/lib/stellar/config";
import { stellarTransactionUrl } from "@/lib/stellar/explorer";

const PAGE_SIZE = 10;

export function CampaignTransactions({
  assetCode,
  campaignId,
  initialError = null,
  initialPage,
  network,
}: {
  assetCode: string;
  campaignId: string;
  initialError?: string | null;
  initialPage: CampaignTransactionPageDto;
  network: StellarNetwork;
}) {
  const [transactions, setTransactions] = useState(initialPage.transactions);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const loadingRef = useRef(false);

  const loadPage = useCallback(async (reset = false) => {
    if (loadingRef.current || (!reset && !hasMore)) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const page = await campaignTransactionsApi.list({
        campaignId,
        cursor: reset ? undefined : nextCursor ?? undefined,
        limit: PAGE_SIZE,
      });
      setTransactions((current) => {
        const retained = reset ? [] : current;
        const knownIds = new Set(retained.map((transaction) => transaction.id));
        return [
          ...retained,
          ...page.transactions.filter((transaction) => !knownIds.has(transaction.id)),
        ];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Campaign transactions are temporarily unavailable.",
      );
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [campaignId, hasMore, nextCursor]);

  return (
    <section aria-labelledby="campaign-transactions-heading" className="mt-12 border-t border-line pt-9">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">On-chain activity</p>
          <h2 id="campaign-transactions-heading" className="mt-2 text-2xl font-extrabold tracking-tight text-ink">
            Transactions
          </h2>
        </div>
        <p className="text-sm text-ink-muted">Newest purchases first</p>
      </div>

      {transactions.length > 0 ? (
        <div className="mt-5 overflow-hidden border-y border-line bg-white">
          <table className="w-full table-fixed text-left">
            <caption className="sr-only">Purchase transactions for campaign {campaignId}</caption>
            <thead className="bg-canvas text-[0.65rem] font-bold uppercase tracking-[0.12em] text-ink-faint">
              <tr>
                <th className="w-[22%] px-4 py-3 sm:px-5" scope="col">Pass</th>
                <th className="w-[32%] px-3 py-3 sm:px-5" scope="col">Amount</th>
                <th className="hidden w-[20%] px-5 py-3 sm:table-cell" scope="col">Ledger</th>
                <th className="w-[46%] px-4 py-3 text-right sm:w-[26%] sm:px-5" scope="col">Transaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="text-sm">
                  <td className="px-4 py-4 font-mono text-xs font-semibold text-ink sm:px-5">#{transaction.passId}</td>
                  <td className="px-3 py-4 font-semibold text-ink sm:px-5">{displayUsdc(transaction.total, assetCode)}</td>
                  <td className="hidden px-5 py-4 font-mono text-xs text-ink-muted sm:table-cell">{transaction.ledger}</td>
                  <td className="px-4 py-4 text-right sm:px-5">
                    <a
                      className="inline-flex items-center justify-end gap-1.5 font-semibold text-forest hover:text-forest-strong"
                      href={stellarTransactionUrl(network, transaction.transactionHash)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View on-chain <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !error ? (
        <div className="mt-5 border-y border-line py-10 text-center">
          <p className="font-semibold text-ink">No purchases yet</p>
          <p className="mt-1 text-sm text-ink-muted">Confirmed purchase transactions will appear here.</p>
        </div>
      ) : null}

      {error && (
        <div className="mt-5">
          <ErrorState
            description={error}
            title="Transactions unavailable"
            onRetry={() => void loadPage(transactions.length === 0)}
          />
        </div>
      )}

      {hasMore && !error && (
        <div className="mt-5 flex justify-center">
          <Button disabled={loading} size="sm" variant="secondary" onClick={() => void loadPage()}>
            {loading && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            Load 10 more
          </Button>
        </div>
      )}
    </section>
  );
}
