"use client";

type Network = "testnet" | "mainnet";
type TransactionKind = "campaign_publish" | "pass_purchase" | "pass_gift" | "pass_redemption";

const transactionKinds: Record<string, TransactionKind | undefined> = {
  "campaign publishing": "campaign_publish",
  "pass purchase": "pass_purchase",
  "pass gift": "pass_gift",
  "pass redemption": "pass_redemption",
};

let posthogClient: Promise<typeof import("posthog-js")> | null = null;

function enabled(): boolean {
  return process.env.NODE_ENV === "production"
    && Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)
    && Boolean(process.env.NEXT_PUBLIC_POSTHOG_HOST);
}

function capture(event: string, properties: Record<string, unknown>): void {
  if (!enabled()) return;
  posthogClient ??= import("posthog-js");
  void posthogClient
    .then(({ default: posthog }) => posthog.capture(event, properties))
    .catch((error: unknown) => {
      console.warn("Analytics could not record an event.", error);
    });
}

export function captureWalletConnected(network: Network): void {
  capture("wallet_connected", { network });
}

export function captureWalletDisconnected(network: Network): void {
  capture("wallet_disconnected", { network });
}

export function captureTransactionSucceeded(transactionLabel: string): void {
  const transactionKind = transactionKinds[transactionLabel];
  if (transactionKind) capture("transaction_succeeded", { transaction_kind: transactionKind });
}

export function captureReviewSubmitted(rating: number): void {
  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
    capture("review_submitted", { rating });
  }
}

export function captureRedemptionQrDisplayed(network: Network): void {
  capture("redemption_qr_displayed", { network });
}
