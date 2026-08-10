import { closeFirebaseApp } from "@/server/firestore/firebase-admin";
import { getServerEnv } from "@/server/env";
import { getStellarConfig } from "@/lib/stellar/config";
import { TtlMaintenanceService } from "@/server/operations/ttl-maintenance-service";

async function run(): Promise<void> {
  try {
    const result = await new TtlMaintenanceService(
      getStellarConfig(),
      getServerEnv().STELLAR_REVIEW_SPONSOR_SECRET,
    ).maintain();
    console.log(`Stellar TTL maintenance verified: ${JSON.stringify(result)}.`);
  } finally {
    await closeFirebaseApp();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stellar TTL maintenance failed.");
  process.exitCode = 1;
});
