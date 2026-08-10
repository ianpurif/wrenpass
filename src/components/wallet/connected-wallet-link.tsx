"use client";

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

import { useWallet } from "@/components/wallet/wallet-provider";

export function ConnectedWalletLink({
  children,
  ...props
}: LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & { children: ReactNode }) {
  const { status } = useWallet();

  if (status !== "connected") return null;

  return <Link {...props}>{children}</Link>;
}
