import * as Sentry from "@sentry/nextjs";
import { after, type NextRequest } from "next/server";

import { getServerEnv } from "@/server/env";
import { hasValidCronAuthorization } from "@/server/operations/cron-auth";
import { getTestnetSimulationService } from "@/server/simulator/testnet-simulation-service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!hasValidCronAuthorization(
    request.headers.get("authorization"),
    getServerEnv().CRON_SECRET,
  )) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const service = getTestnetSimulationService();
    const reservation = await service.reserveRun();
    if (!reservation.accepted) {
      return Response.json(reservation, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    after(async () => {
      try {
        const result = await service.run();
        console.info("Testnet purchase simulation completed.", result);
      } catch (error) {
        Sentry.captureException(error, { tags: { operation: "testnet-purchase-simulation" } });
        console.error("Testnet purchase simulation failed.", error);
      }
    });
    return Response.json({ accepted: true }, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: "testnet-purchase-simulation-trigger" } });
    console.error("Testnet purchase simulation could not be scheduled.", error);
    return Response.json(
      { error: "The Testnet simulation could not be scheduled." },
      { status: 503 },
    );
  }
}
