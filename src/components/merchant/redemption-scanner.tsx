"use client";

import { Camera, CheckCircle2, ImageUp, LoaderCircle, ScanLine } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <section aria-labelledby="redeem-pass-heading">
      <Card className="grid overflow-hidden lg:grid-cols-[0.72fr_1.28fr]">
        <div className="bg-ink p-7 text-white sm:p-8">
          <ScanLine aria-hidden="true" className="size-6 text-mint" />
          <h2 id="redeem-pass-heading" className="mt-5 text-2xl font-extrabold tracking-tight">Redeem a customer pass</h2>
          <p className="mt-3 text-sm leading-6 text-white/65">Scan the customer&apos;s QR, approve as the campaign merchant, then ask the current owner to approve from their wallet.</p>
        </div>
        <div className="p-7 sm:p-8">
          {cameraOpen && (
            <div className="mb-5 overflow-hidden rounded-2xl bg-ink">
              <video aria-label="QR scanner camera" className="aspect-video w-full object-cover" muted playsInline ref={videoRef} />
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button disabled={working} variant={cameraOpen ? "secondary" : "primary"} onClick={() => setCameraOpen((open) => !open)}>
              {working ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Camera aria-hidden="true" className="size-4" />}
              {cameraOpen ? "Close camera" : "Open scanner"}
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-bold text-ink transition hover:border-forest/35">
              <ImageUp aria-hidden="true" className="size-4" /> Use QR image
              <input className="sr-only" type="file" accept="image/*" disabled={working} onChange={(event) => void scanImage(event.target.files?.[0])} />
            </label>
          </div>
          {error && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{error}</p>}
          {success && <p role="status" className="mt-4 flex items-start gap-2 text-sm font-semibold text-forest"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{success}</p>}
          <p className="mt-4 text-xs leading-5 text-ink-faint">Camera scanning requires HTTPS outside localhost. An uploaded QR image is processed in this browser and is not stored.</p>
        </div>
      </Card>
    </section>
  );
}
