"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { LoadingState } from "@/components/ui/feedback-state";
import { useWallet } from "@/components/wallet/wallet-provider";

export function WalletRouteGuard({ children }: { children: ReactNode }) {
  const { status } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (status === "disconnected") router.replace("/");
  }, [router, status]);

  if (status !== "connected") {
    return <LoadingState className="min-h-[28rem]" label="Checking wallet access" />;
  }

  return children;
}
