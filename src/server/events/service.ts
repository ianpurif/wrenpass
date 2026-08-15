import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import {
  readContractCampaign,
  readContractPass,
  readContractPassCount,
} from "@/lib/stellar/wrenpass-client";
import { createEmailService } from "@/server/email/email-service";
import { EventSyncService } from "@/server/events/event-sync-service";
import type { ExpectedTransaction } from "@/server/events/event-sync-service";
import type { EventSyncOptions } from "@/server/events/event-sync-service";
import { StellarWrenPassEventSource } from "@/server/events/event-source";
import { FirestoreNotificationClaimStore } from "@/server/events/firestore-notification-claim-store";
import { createOffchainRepositories } from "@/server/firestore/repositories";
import { FirestoreOperationalStateStore } from "@/server/operations/operational-state-store";

let eventSyncService: EventSyncService | undefined;
const eventSyncRequests = new Map<string, ReturnType<EventSyncService["sync"]>>();
let eventSyncTail: Promise<void> = Promise.resolve();

export function getEventSyncService(): EventSyncService {
  if (!eventSyncService) {
    const config = getStellarConfig();
    eventSyncService = new EventSyncService(
      new StellarWrenPassEventSource(config),
      createOffchainRepositories(),
      {
        findCampaign: (campaignId) => readContractCampaign(config, campaignId),
        getPassCount: () => readContractPassCount(config),
        findPass: (passId) => readContractPass(config, passId),
      },
      new FirestoreNotificationClaimStore(),
      createEmailService(),
      config.wrenPassContractId,
      new FirestoreOperationalStateStore(),
    );
  }
  return eventSyncService;
}

export function syncEvents(
  expectedTransaction?: ExpectedTransaction,
  options: EventSyncOptions = {},
) {
  const mode = options.includeExpirationNotices === false ? "events" : "full";
  const key = `${expectedTransaction?.transactionHash.toLowerCase() ?? "latest"}:${mode}`;
  const current = eventSyncRequests.get(key);
  if (current) return current;

  const request = eventSyncTail
    .catch(() => undefined)
    .then(() => getEventSyncService().sync(expectedTransaction, options))
    .finally(() => {
      if (eventSyncRequests.get(key) === request) eventSyncRequests.delete(key);
    });
  eventSyncTail = request.then(
    () => undefined,
    () => undefined,
  );
  eventSyncRequests.set(key, request);
  return request;
}
