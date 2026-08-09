import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import {
  readContractCampaign,
  readContractPass,
  readContractPassCount,
} from "@/lib/stellar/wrenpass-client";
import { createEmailService } from "@/server/email/email-service";
import { EventSyncService } from "@/server/events/event-sync-service";
import { StellarWrenPassEventSource } from "@/server/events/event-source";
import { createOffchainRepositories } from "@/server/firestore/repositories";

let eventSyncService: EventSyncService | undefined;

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
      createEmailService(),
      config.wrenPassContractId,
    );
  }
  return eventSyncService;
}
