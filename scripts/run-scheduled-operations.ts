import { closeFirebaseApp } from "@/server/firestore/firebase-admin";
import { getScheduledOperationsService } from "@/server/operations/operations-service";

async function run(): Promise<void> {
  try {
    const result = await getScheduledOperationsService().run();
    console.log(`Scheduled operations completed: ${JSON.stringify(result)}.`);
  } finally {
    await closeFirebaseApp();
  }
}

run().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : `Scheduled operations failed: ${JSON.stringify(error)}.`,
  );
  process.exitCode = 1;
});
