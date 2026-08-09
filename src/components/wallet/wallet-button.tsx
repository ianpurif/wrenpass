"use client";

import { LoaderCircle, LogOut, WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useWallet } from "@/components/wallet/wallet-provider";

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletButton({ className }: { className?: string }) {
  const { address, connect, disconnect, error, status } = useWallet();
  const pending = status === "checking" || status === "connecting";

  return (
    <div className={cn("relative", className)}>
      {status === "connected" && address ? (
        <Button
          aria-label={`Disconnect wallet ${address}`}
          className="w-full"
          size="sm"
          variant="secondary"
          onClick={() => void disconnect()}
        >
          <WalletCards aria-hidden="true" className="size-4 text-forest" />
          {shortenAddress(address)}
          <LogOut aria-hidden="true" className="size-3.5 text-ink-faint" />
        </Button>
      ) : (
        <Button
          className="w-full"
          disabled={pending}
          size="sm"
          onClick={() => void connect()}
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <WalletCards aria-hidden="true" className="size-4" />
          )}
          {status === "checking"
            ? "Checking wallet"
            : status === "connecting"
              ? "Connecting"
              : "Connect Freighter"}
        </Button>
      )}

      {error && (
        <div
          role="alert"
          className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-72 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2.5 text-left text-xs font-semibold leading-5 text-danger shadow-soft"
        >
          {error}
        </div>
      )}
    </div>
  );
}
