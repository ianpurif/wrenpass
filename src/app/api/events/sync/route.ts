import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { syncConfirmedTransaction, syncEvents } from "@/server/events/service";
import { getRequestWalletAddress } from "@/server/wallet-auth/request-session";

export const runtime = "nodejs";

const requestSchema = z.object({
  transactionHash: z.string().regex(/^[a-f\d]{64}$/i).optional(),
  ledger: z.number().int().positive().optional(),
}).refine(
  (value) => Boolean(value.transactionHash) === Boolean(value.ledger),
  "Transaction hash and ledger must be provided together.",
);

export async function POST(request: NextRequest) {
  if (!(await getRequestWalletAddress(request))) {
    return Response.json({ error: "Connect your wallet first." }, { status: 401 });
  }
  try {
    const body = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) {
      return Response.json({ error: "Invalid event sync request." }, { status: 400 });
    }
    const expectedTransaction = body.data.transactionHash && body.data.ledger
      ? {
          transactionHash: body.data.transactionHash,
          ledger: body.data.ledger,
        }
      : undefined;
    return Response.json(
      expectedTransaction
        ? await syncConfirmedTransaction(expectedTransaction, {
            includeExpirationNotices: false,
          })
        : await syncEvents(undefined, { includeExpirationNotices: false }),
    );
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: "event-sync" } });
    console.error("Event synchronization failed.", error);
    return Response.json(
      { error: "Event sync is temporarily unavailable. The on-chain transaction is unaffected." },
      { status: 503 },
    );
  }
}
