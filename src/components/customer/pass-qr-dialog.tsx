"use client";

import { QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { Dialog } from "@/components/ui/dialog";
import { encodeRedemptionQrPayload } from "@/features/redemption/qr";
import type { StellarConfig } from "@/lib/stellar/config";

export function PassQrDialog({
  config,
  open,
  passId,
  onOpenChange,
}: {
  config: StellarConfig;
  open: boolean;
  passId: string;
  onOpenChange(open: boolean): void;
}) {
  const payload = encodeRedemptionQrPayload({
    network: config.network,
    contractId: config.wrenPassContractId,
    passId,
  });

  return (
    <Dialog
      description="Ask the merchant to scan this pass. The QR identifies it, but cannot redeem it without both wallets approving the Stellar transaction."
      open={open}
      title={`Redeem pass #${passId}`}
      onOpenChange={onOpenChange}
    >
      <div className="grid justify-items-center gap-5 text-center">
        <div className="rounded-3xl border border-line bg-white p-5 shadow-sm">
          <QRCodeSVG
            aria-label={`Redemption QR for WrenPass ${passId}`}
            bgColor="#ffffff"
            fgColor="#153d32"
            level="Q"
            size={240}
            title={`WrenPass ${passId}`}
            value={payload}
          />
        </div>
        <div className="rounded-2xl border border-mint bg-mint-soft p-4 text-left text-sm leading-6 text-ink-muted">
          <p className="flex items-start gap-2 font-bold text-ink">
            <QrCode aria-hidden="true" className="mt-1 size-4 shrink-0 text-forest" />
            This QR is not a bearer credential.
          </p>
          <p className="mt-1">After scanning, the merchant approves first. You must then approve and submit the redemption from this wallet.</p>
        </div>
      </div>
    </Dialog>
  );
}
