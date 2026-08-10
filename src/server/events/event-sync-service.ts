import "server-only";

import type { Campaign, Pass } from "@/generated/wrenpass-contract/src";
import { buildNotificationEmail, type EmailService } from "@/server/email/email-service";
import type { OffchainRepositories } from "@/server/firestore/repositories";
import {
  indexedBlockchainEventSchema,
  notificationSchema,
  type Notification,
  type NotificationType,
} from "@/server/models";
import type { WrenPassEvent, WrenPassEventSource } from "@/server/events/event-source";

interface LifecycleReader {
  findCampaign(campaignId: bigint): Promise<Campaign | null>;
  getPassCount(): Promise<bigint>;
  findPass(passId: bigint): Promise<Pass | null>;
}

interface NotificationTarget {
  walletAddress: string;
  type: NotificationType;
}

export interface NotificationClaimStore {
  claim(
    notification: Notification,
    now: Date,
    claimExpiresAt: Date,
  ): Promise<boolean>;
}

export interface EventSyncResult {
  indexed: number;
  duplicates: number;
  notificationsSent: number;
  notificationFailures: number;
}

const EXPIRATION_NOTICE_WINDOW_SECONDS = BigInt(7 * 24 * 60 * 60);
const MAX_EXPIRATION_PASS_READS = BigInt(2_000);
const NOTIFICATION_CLAIM_MS = 5 * 60 * 1_000;

function notificationTargets(event: WrenPassEvent): NotificationTarget[] {
  if (event.eventType === "pass_purchased" && event.customer) {
    return [{ walletAddress: event.customer, type: "pass_purchased" }];
  }
  if (event.eventType === "pass_gifted") {
    return [
      ...(event.previousOwner
        ? [{ walletAddress: event.previousOwner, type: "pass_gifted" as const }]
        : []),
      ...(event.recipient
        ? [{ walletAddress: event.recipient, type: "pass_received" as const }]
        : []),
    ];
  }
  if (event.eventType === "pass_redeemed" && event.owner) {
    return [{ walletAddress: event.owner, type: "pass_redeemed" }];
  }
  if (event.eventType === "pass_refunded" && event.owner) {
    return [{ walletAddress: event.owner, type: "refund_processed" }];
  }
  return [];
}

function emailCopy(type: NotificationType, relatedEntityId: string) {
  const pass = `pass #${relatedEntityId}`;
  switch (type) {
    case "pass_purchased":
      return { subject: "Your WrenPass purchase is confirmed", heading: "Your pass is ready", body: `Your purchase of ${pass} was confirmed on Stellar. Open WrenPass to view its current status and QR.` };
    case "pass_gifted":
      return { subject: "Your WrenPass gift was sent", heading: "Pass ownership changed", body: `Your gift of ${pass} was confirmed on Stellar. The recipient is now the current owner.` };
    case "pass_received":
      return { subject: "You received a WrenPass", heading: "A pass was gifted to you", body: `You are now the on-chain owner of ${pass}. Open WrenPass to review it.` };
    case "pass_redeemed":
      return { subject: "Your WrenPass was redeemed", heading: "Redemption confirmed", body: `${pass} was redeemed on Stellar. It cannot be redeemed or transferred again.` };
    case "refund_processed":
      return { subject: "Your WrenPass refund was processed", heading: "Refund confirmed", body: `The contract processed the eligible refund for ${pass}. Open your wallet to review the transaction.` };
    case "campaign_sold_out":
      return { subject: "Your WrenPass campaign sold out", heading: "All passes are sold", body: `Campaign #${relatedEntityId} reached its fixed supply on Stellar.` };
    case "pass_nearing_expiration":
      return { subject: "Your WrenPass is nearing expiration", heading: "Use your pass soon", body: `${pass} is approaching its contract-defined expiration.` };
  }
}

export class EventSyncService {
  constructor(
    private readonly source: WrenPassEventSource,
    private readonly repositories: OffchainRepositories,
    private readonly lifecycle: LifecycleReader,
    private readonly notificationClaims: NotificationClaimStore,
    private readonly email: Pick<EmailService, "send">,
    private readonly contractId: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async deliverExpirationNotices(result: EventSyncResult): Promise<void> {
    const passCount = await this.lifecycle.getPassCount();
    if (passCount > MAX_EXPIRATION_PASS_READS) {
      throw new Error("Expiration notification scan exceeded its safe direct-read limit.");
    }

    const nowEpochSeconds = BigInt(Math.floor(this.now().getTime() / 1_000));
    const campaigns = new Map<string, Campaign | null>();
    for (let passId = BigInt(1); passId <= passCount; passId += BigInt(1)) {
      const pass = await this.lifecycle.findPass(passId);
      if (!pass || pass.status.tag !== "Active") continue;

      const campaignId = pass.campaign_id.toString();
      if (!campaigns.has(campaignId)) {
        campaigns.set(campaignId, await this.lifecycle.findCampaign(pass.campaign_id));
      }
      const campaign = campaigns.get(campaignId);
      if (
        !campaign ||
        campaign.expires_at <= nowEpochSeconds ||
        campaign.expires_at > nowEpochSeconds + EXPIRATION_NOTICE_WINDOW_SECONDS
      ) {
        continue;
      }

      const delivery = await this.deliver(
        `expiring-${pass.id.toString()}-${campaign.expires_at.toString()}`,
        pass.id.toString(),
        { walletAddress: pass.owner, type: "pass_nearing_expiration" },
      );
      if (delivery === "sent") result.notificationsSent += 1;
      if (delivery === "failed") result.notificationFailures += 1;
    }
  }

  private async deliver(
    eventId: string,
    relatedEntityId: string,
    target: NotificationTarget,
  ): Promise<"sent" | "failed" | "skipped"> {
    const profile = await this.repositories.userProfiles.findById(target.walletAddress);
    if (!profile?.email) return "skipped";
    const id = `${eventId}:${target.type}:${target.walletAddress}`;
    const existing = await this.repositories.notifications.findById(id);
    if (existing?.status === "sent") return "skipped";

    const createdAt = existing?.createdAt ?? this.now().toISOString();
    const pending = notificationSchema.parse({
      id,
      recipientWalletAddress: target.walletAddress,
      type: target.type,
      status: "pending",
      relatedEntityId,
      createdAt,
    });
    const claimedAt = this.now();
    const claimed = await this.notificationClaims.claim(
      pending,
      claimedAt,
      new Date(claimedAt.getTime() + NOTIFICATION_CLAIM_MS),
    );
    if (!claimed) return "skipped";

    try {
      const copy = emailCopy(target.type, relatedEntityId);
      await this.email.send(buildNotificationEmail({ to: profile.email, ...copy }));
      await this.repositories.notifications.save({
        ...pending,
        status: "sent",
        sentAt: this.now().toISOString(),
      });
      return "sent";
    } catch (error) {
      await this.repositories.notifications.save({
        ...pending,
        status: "failed",
        failureReason: error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed.",
      });
      return "failed";
    }
  }

  async sync(): Promise<EventSyncResult> {
    const events = await this.source.readRetainedEvents();
    const result: EventSyncResult = {
      indexed: 0,
      duplicates: 0,
      notificationsSent: 0,
      notificationFailures: 0,
    };

    for (const event of events) {
      const existing = await this.repositories.indexedBlockchainEvents.findById(event.id);
      if (existing) {
        result.duplicates += 1;
      } else {
        await this.repositories.indexedBlockchainEvents.save(
          indexedBlockchainEventSchema.parse({
            id: event.id,
            contractId: this.contractId,
            transactionHash: event.transactionHash,
            eventIndex: event.eventIndex,
            ledger: event.ledger,
            eventType: event.eventType,
            payload: {
              campaignId: event.campaignId,
              ...(event.passId ? { passId: event.passId } : {}),
              ...event.payload,
            },
            indexedAt: this.now().toISOString(),
          }),
        );
        result.indexed += 1;
      }

      for (const target of notificationTargets(event)) {
        const delivery = await this.deliver(event.id, event.passId ?? event.campaignId, target);
        if (delivery === "sent") result.notificationsSent += 1;
        if (delivery === "failed") result.notificationFailures += 1;
      }

      if (event.eventType === "pass_purchased") {
        const campaign = await this.lifecycle.findCampaign(BigInt(event.campaignId));
        if (campaign && campaign.sold === campaign.max_supply) {
          const soldOutId = `sold-out-${event.campaignId}`;
          if (!(await this.repositories.indexedBlockchainEvents.findById(soldOutId))) {
            await this.repositories.indexedBlockchainEvents.save(
              indexedBlockchainEventSchema.parse({
                id: soldOutId,
                contractId: this.contractId,
                transactionHash: event.transactionHash,
                eventIndex: event.eventIndex,
                ledger: event.ledger,
                eventType: "campaign_sold_out",
                payload: { campaignId: event.campaignId, merchant: campaign.merchant },
                indexedAt: this.now().toISOString(),
              }),
            );
            result.indexed += 1;
          }
          const delivery = await this.deliver(soldOutId, event.campaignId, {
            walletAddress: campaign.merchant,
            type: "campaign_sold_out",
          });
          if (delivery === "sent") result.notificationsSent += 1;
          if (delivery === "failed") result.notificationFailures += 1;
        }
      }
    }
    await this.deliverExpirationNotices(result);
    return result;
  }
}
