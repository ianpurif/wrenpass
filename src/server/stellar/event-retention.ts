import "server-only";

import { rpc } from "@stellar/stellar-sdk";

const RETENTION_SAFETY_LEDGERS = 100;
const LEDGER_RANGE_PATTERN = /startLedger must be within the ledger range:\s*(\d+)\s*-\s*(\d+)/i;

interface EventRetentionReader {
  getHealth(): Promise<rpc.Api.GetHealthResponse>;
  getLatestLedger(): Promise<rpc.Api.GetLatestLedgerResponse>;
  getEvents(request: rpc.Api.GetEventsRequest): Promise<rpc.Api.GetEventsResponse>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error !== "object" || error === null || !("message" in error)) return "";
  return typeof error.message === "string" ? error.message : "";
}

export function isStaleLedgerHealthError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes("since last known ledger closed is too high");
}

export function retryStartLedgerFromRangeError(error: unknown): number | null {
  const match = errorMessage(error).match(LEDGER_RANGE_PATTERN);
  if (!match) return null;

  const oldestLedger = Number(match[1]);
  const latestLedger = Number(match[2]);
  if (!Number.isSafeInteger(oldestLedger) || !Number.isSafeInteger(latestLedger)) return null;
  return Math.max(1, Math.min(latestLedger, oldestLedger + RETENTION_SAFETY_LEDGERS));
}

function safeRetainedRange(oldestLedger: number, latestLedger: number) {
  const startLedger = Math.max(1, Math.min(latestLedger, oldestLedger + RETENTION_SAFETY_LEDGERS));
  return { startLedger, endLedger: latestLedger };
}

export async function resolveRetainedEventRange(
  reader: EventRetentionReader,
  filters: rpc.Api.EventFilter[],
): Promise<{ startLedger: number; endLedger: number }> {
  try {
    const health = await reader.getHealth();
    return safeRetainedRange(health.oldestLedger, health.latestLedger);
  } catch (error) {
    if (!isStaleLedgerHealthError(error)) throw error;

    const latest = await reader.getLatestLedger();
    let retention: rpc.Api.GetEventsResponse;
    try {
      retention = await reader.getEvents({
        startLedger: latest.sequence,
        filters,
        limit: 1,
      });
    } catch (probeError) {
      const retryStartLedger = retryStartLedgerFromRangeError(probeError);
      if (retryStartLedger === null) throw probeError;
      retention = await reader.getEvents({
        startLedger: retryStartLedger,
        filters,
        limit: 1,
      });
    }
    return safeRetainedRange(
      retention.oldestLedger,
      Math.max(latest.sequence, retention.latestLedger),
    );
  }
}
