"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWallet } from "@/components/wallet/wallet-provider";
import { redemptionApi } from "@/features/redemption/api";
import { notificationApi } from "@/features/notifications/api";
import type { RedemptionRequestDto } from "@/features/redemption/dto";
import { shortenStellarAddress } from "@/features/merchant/display";
import type { StellarConfig } from "@/lib/stellar/config";
import { StellarRedemptionContractWriter } from "@/lib/stellar/wrenpass-client";

export function RedemptionRequests({
  config,
  onRedeemed,
}: {
  config: StellarConfig;
  onRedeemed(): Promise<void>;
}) {
  const { address, signTransaction } = useWallet();
  const writer = useMemo(() => new StellarRedemptionContractWriter(config), [config]);
  const [requests, setRequests] = useState<RedemptionRequestDto[]>([]);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    try {
      setRequests(await redemptionApi.getPending());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load redemption requests.");
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    let active = true;
    redemptionApi.getPending().then(
      (nextRequests) => {
        if (!active) return;
        setRequests(nextRequests);
        setError(null);
      },
      (loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load redemption requests.");
      },
    );
    return () => {
      active = false;
    };
  }, [address]);

  async function approve(request: RedemptionRequestDto) {
    if (!address || request.owner !== address) return;
    setWorkingId(request.id);
    setError(null);
    try {
      const sent = await writer.approveAndSubmit({
        serializedTransaction: request.serializedTransaction,
        owner: address,
        signTransaction: (transactionXdr) => signTransaction(transactionXdr),
      });
      await redemptionApi.complete(request.id, sent.transactionHash);
      try {
        await notificationApi.syncEvents();
      } catch {
        setError("Pass redeemed on Stellar, but event and email sync is pending. Use Refresh to retry.");
      }
      await Promise.all([load(), onRedeemed()]);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Redemption could not be approved.");
    } finally {
      setWorkingId(null);
    }
  }

  if (!requests.length && !error) return null;

  return (
    <section aria-labelledby="redemption-requests-heading">
      <div>
        <p className="eyebrow">Wallet approval required</p>
        <h2 id="redemption-requests-heading" className="mt-3 text-2xl font-extrabold tracking-tight text-ink">Pending redemptions</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">Confirm only while you are physically receiving the service. The merchant has approved, but the pass stays active until you submit the transaction.</p>
      </div>
      {error && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{error}</p>}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {requests.map((request) => (
          <Card className="p-6" key={request.id}>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint-soft text-forest"><ShieldCheck aria-hidden="true" className="size-5" /></span>
              <div>
                <h3 className="font-extrabold text-ink">Redeem pass #{request.passId}</h3>
                <p className="mt-1 text-xs font-semibold text-ink-muted">Merchant {shortenStellarAddress(request.merchant)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-ink-muted">Approval releases the pass&apos;s protected reserve according to its contract terms and permanently marks the pass redeemed.</p>
            <Button className="mt-5" disabled={workingId !== null} onClick={() => void approve(request)}>
              {workingId === request.id && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              Approve and redeem
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}
