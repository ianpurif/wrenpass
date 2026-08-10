"use client";

import { Camera, CheckCircle2, ImageUp, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/wallet-provider";
import { redemptionApi } from "@/features/redemption/api";
import { parseRedemptionQrPayload } from "@/features/redemption/qr";
import { shortenStellarAddress } from "@/features/merchant/display";
import type { StellarConfig } from "@/lib/stellar/config";
import { StellarRedemptionContractWriter } from "@/lib/stellar/wrenpass-client";

export function RedemptionScanner({ config }: { config: StellarConfig }) {
  const { address, signAuthEntry } = useWallet();
  const writer = useMemo(() => new StellarRedemptionContractWriter(config), [config]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<{ destroy(): void; start(): Promise<void>; stop(): void } | null>(null);
  const workingRef = useRef(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const processPayload = useCallback(async (encodedQr: string) => {
    if (!address || workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    setError(null);
    setSuccess(null);
    scannerRef.current?.stop();
    try {
      parseRedemptionQrPayload(encodedQr);
      const scan = await redemptionApi.validate(encodedQr);
      const prepared = await writer.prepareMerchantAuthorization({
        passId: BigInt(scan.passId),
        merchant: address,
        owner: scan.owner,
        signAuthEntry: (authEntryXdr) => signAuthEntry(authEntryXdr),
      });
      await redemptionApi.create({ qrPayload: encodedQr, ...prepared });
      setSuccess(`Pass #${scan.passId} is waiting for ${shortenStellarAddress(scan.owner)} to approve.`);
      setCameraOpen(false);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "The QR code could not be processed.");
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }, [address, signAuthEntry, writer]);

  useEffect(() => {
    if (!cameraOpen || !videoRef.current) return;
    let active = true;
    void import("qr-scanner").then(async ({ default: QrScanner }) => {
      if (!active || !videoRef.current) return;
      const scanner = new QrScanner(
        videoRef.current,
        (result) => void processPayload(result.data),
        { preferredCamera: "environment", returnDetailedScanResult: true },
      );
      scannerRef.current = scanner;
      try {
        await scanner.start();
      } catch {
        if (active) setError("Camera access failed. Use the QR image option instead.");
      }
    });
    return () => {
      active = false;
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, [cameraOpen, processPayload]);

  async function scanImage(file: File | undefined) {
    if (!file) return;
    try {
      const { default: QrScanner } = await import("qr-scanner");
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      await processPayload(result.data);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : "No QR code was found in that image.");
    }
  }

  return (
    <section aria-labelledby="redeem-pass-heading" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="rounded-card border border-line bg-white">
        <div className="border-b border-line px-6 py-5 sm:px-7">
          <h2 id="redeem-pass-heading" className="font-bold text-ink">Scan customer QR</h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">Use the camera or upload a QR image from this device.</p>
        </div>
        <div className="p-6 sm:p-7">
          {cameraOpen && (
            <div className="mb-5 overflow-hidden rounded-xl bg-ink">
              <video aria-label="QR scanner camera" className="aspect-video w-full object-cover" muted playsInline ref={videoRef} />
            </div>
          )}
          {!cameraOpen && (
            <div className="mb-5 grid min-h-48 place-items-center rounded-xl border border-dashed border-line bg-workspace px-6 text-center">
              <div>
                <Camera aria-hidden="true" className="mx-auto size-6 text-forest" />
                <p className="mt-3 text-sm font-semibold text-ink">Camera is off</p>
                <p className="mt-1 text-xs text-ink-faint">Nothing is recorded or uploaded.</p>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button className="w-full sm:w-auto" disabled={working} variant={cameraOpen ? "secondary" : "primary"} onClick={() => setCameraOpen((open) => !open)}>
              {working ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Camera aria-hidden="true" className="size-4" />}
              {cameraOpen ? "Close camera" : "Open scanner"}
            </Button>
            <label className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-bold text-ink transition hover:border-forest/35 sm:w-auto">
              <ImageUp aria-hidden="true" className="size-4" /> Use QR image
              <input className="sr-only" type="file" accept="image/*" disabled={working} onChange={(event) => void scanImage(event.target.files?.[0])} />
            </label>
          </div>
          {error && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{error}</p>}
          {success && <p role="status" className="mt-4 flex items-start gap-2 text-sm font-semibold text-forest"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{success}</p>}
          <p className="mt-4 text-xs leading-5 text-ink-faint">Camera scanning requires HTTPS outside localhost. An uploaded QR image is processed in this browser and is not stored.</p>
        </div>
      </div>

      <aside className="self-start rounded-card border border-line bg-white p-6 xl:sticky xl:top-24">
        <h2 className="text-sm font-bold text-ink">Redemption flow</h2>
        <ol className="mt-4 grid gap-5">
          {[
            ["1", "Scan the pass", "The QR identifies the pass but cannot redeem it alone."],
            ["2", "Approve as merchant", "Your wallet prepares the merchant-authorized request."],
            ["3", "Customer approves", "The current owner submits the final redemption transaction."],
          ].map(([number, title, description]) => (
            <li className="grid grid-cols-[1.5rem_1fr] gap-3" key={number}>
              <span className="font-mono text-xs font-bold text-coral-strong">{number}</span>
              <div>
                <p className="text-sm font-semibold text-ink">{title}</p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  );
}
