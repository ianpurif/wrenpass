"use client";

import posthog from "posthog-js";

type Network = "testnet" | "mainnet";
type TransactionKind = "campaign_publish" | "pass_purchase" | "pass_gift" | "pass_redemption";

const transactionKinds: Record<string, TransactionKind | undefined> = {
  "campaign publishing": "campaign_publish",
  "pass purchase": "pass_purchase",
  "pass gift": "pass_gift",
  "pass redemption": "pass_redemption",
};

function enabled(): boolean {
  return process.env.NODE_ENV === "production"
    && Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)
    && Boolean(process.env.NEXT_PUBLIC_POSTHOG_HOST);
}

export function captureWalletConnected(network: Network): void {
  if (enabled()) posthog.capture("wallet_connected", { network });
}

export function captureWalletDisconnected(network: Network): void {
  if (enabled()) posthog.capture("wallet_disconnected", { network });
}

export function captureTransactionSucceeded(transactionLabel: string): void {
  const transactionKind = transactionKinds[transactionLabel];
  if (enabled() && transactionKind) {
    posthog.capture("transaction_succeeded", { transaction_kind: transactionKind });
  }
}

export function captureReviewSubmitted(rating: number): void {
  if (enabled() && Number.isInteger(rating) && rating >= 1 && rating <= 5) {
    posthog.capture("review_submitted", { rating });
  }
}

export function captureRedemptionQrDisplayed(network: Network): void {
  if (enabled()) posthog.capture("redemption_qr_displayed", { network });
}
