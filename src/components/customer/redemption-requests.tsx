"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/wallet-provider";
import { syncEventsAfterMutation } from "@/features/notifications/api";
import { redemptionApi } from "@/features/redemption/api";
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
      void syncEventsAfterMutation();
      await Promise.all([load(), onRedeemed()]);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Redemption could not be approved.");
    } finally {
      setWorkingId(null);
    }
  }

  if (!requests.length && !error) return null;

  return (
    <section aria-labelledby="redemption-requests-heading" className="overflow-hidden rounded-2xl border border-coral/35 bg-white">
      <div className="border-b border-coral/20 bg-coral-soft px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-coral-strong" />
          <div>
            <h2 id="redemption-requests-heading" className="font-bold text-ink">Pending redemption approval</h2>
            <p className="mt-1 text-sm leading-6 text-ink-muted">Approve only while you are receiving the service. The pass remains active until you submit.</p>
          </div>
        </div>
      </div>
      {error && <p role="alert" className="px-5 pt-4 text-sm font-semibold text-danger sm:px-6">{error}</p>}
      <div className="divide-y divide-line">
        {requests.map((request) => (
          <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6" key={request.id}>
            <div>
              <div>
                <h3 className="font-bold text-ink">Pass #{request.passId}</h3>
                <p className="mt-1 text-xs font-semibold text-ink-muted">Merchant {shortenStellarAddress(request.merchant)}</p>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Approval permanently marks the pass redeemed and releases its reserve according to the campaign terms.</p>
            </div>
            <Button className="w-full shrink-0 sm:w-auto" disabled={workingId !== null} onClick={() => void approve(request)}>
              {workingId === request.id && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              Approve and redeem
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
