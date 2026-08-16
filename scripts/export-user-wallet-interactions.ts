import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { StrKey } from "@stellar/stellar-sdk";
import {
  FieldPath,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { z, type ZodType } from "zod";

import { getStellarConfig } from "@/lib/stellar/config";
import {
  StellarWrenPassEventSource,
  type WrenPassEvent,
} from "@/server/events/event-source";
import { closeFirebaseApp, getFirestoreDb } from "@/server/firestore/firebase-admin";
import {
  cloudinaryAssetReferenceSchema,
  indexedBlockchainEventSchema,
  notificationSchema,
  userProfileSchema,
  type CloudinaryAssetReference,
  type IndexedBlockchainEvent,
  type Notification,
  type UserProfile,
} from "@/server/models";
import {
  mergeWalletReportEvents,
  type WalletReportBlockchainEvent,
} from "@/server/reports/wallet-report-events";

const PAGE_SIZE = 500;
const walletAddressSchema = z
  .string()
  .refine(StrKey.isValidEd25519PublicKey, "must be a valid Stellar account");
const walletSessionSchema = z.object({
  tokenHash: z.string().length(64),
  address: walletAddressSchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

type WalletSession = z.infer<typeof walletSessionSchema>;
type WalletRole =
  | "customer"
  | "merchant"
  | "owner"
  | "platform"
  | "previous_owner"
  | "recipient"
  | "reviewer";

interface CliOptions {
  compact: boolean;
  force: boolean;
  help: boolean;
  outputPath?: string;
}

interface BlockchainInteraction extends WalletReportBlockchainEvent {
  roles: WalletRole[];
}

interface UserWalletReport {
  walletAddress: string;
  profile: Omit<UserProfile, "id"> | null;
  interactions: {
    blockchain: BlockchainInteraction[];
    walletSessions: Array<{
      createdAt: string;
      expiresAt: string;
      status: "active" | "expired";
    }>;
    notifications: Notification[];
    managedAssets: CloudinaryAssetReference[];
  };
  totals: {
    blockchain: number;
    walletSessions: number;
    notifications: number;
    managedAssets: number;
  };
}

interface WalletReport {
  generatedAt: string;
  scope: {
    blockchain: string;
    walletSessions: string;
  };
  totals: {
    users: number;
    blockchainInteractions: number;
    walletSessions: number;
    notifications: number;
    managedAssets: number;
  };
  users: UserWalletReport[];
}

const walletPayloadRoles: Readonly<Record<string, WalletRole>> = {
  customer: "customer",
  merchant: "merchant",
  merchantWalletAddress: "merchant",
  owner: "owner",
  ownerWalletAddress: "owner",
  platform: "platform",
  previousOwner: "previous_owner",
  previous_owner: "previous_owner",
  recipient: "recipient",
  recipientWalletAddress: "recipient",
  reviewer: "reviewer",
  reviewerWalletAddress: "reviewer",
};

const notificationRoles: Readonly<Partial<Record<Notification["type"], WalletRole>>> = {
  campaign_sold_out: "merchant",
  pass_gifted: "previous_owner",
  pass_purchased: "customer",
  pass_received: "recipient",
  pass_redeemed: "owner",
  refund_processed: "owner",
};

function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = { compact: false, force: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--compact") {
      options.compact = true;
    } else if (argument === "--force") {
      options.force = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--output" || argument === "-o") {
      const outputPath = args[index + 1];
      if (!outputPath || outputPath.startsWith("-")) {
        throw new Error(`${argument} requires a file path.`);
      }
      options.outputPath = outputPath;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function printHelp(): void {
  console.log(`Export every retained WrenPass user and wallet interaction as one JSON document.

Usage:
  pnpm users:wallet-report
  pnpm users:wallet-report --compact
  pnpm users:wallet-report --output ./wallet-report.json
  pnpm users:wallet-report --output ./wallet-report.json --force

Options:
  -o, --output <path>  Write JSON to a file instead of stdout
      --compact        Emit compact JSON instead of indented JSON
      --force          Allow an existing output file to be replaced
  -h, --help           Show this help`);
}

async function readCollection<T>(
  db: Firestore,
  collectionName: string,
  schema: ZodType<T>,
): Promise<T[]> {
  const values: T[] = [];
  let lastDocument: QueryDocumentSnapshot | undefined;

  while (true) {
    let query = db
      .collection(collectionName)
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (lastDocument) query = query.startAfter(lastDocument);

    const snapshot = await query.get();
    if (snapshot.empty) break;
    for (const document of snapshot.docs) {
      const value = schema.parse(document.data());
      const embeddedId =
        typeof value === "object" && value !== null && "id" in value
          ? (value as { id?: unknown }).id
          : undefined;
      if (embeddedId !== undefined && embeddedId !== document.id) {
        throw new Error(`${collectionName}/${document.id} has a mismatched ID.`);
      }
      values.push(value);
    }
    lastDocument = snapshot.docs.at(-1);
  }

  return values;
}

function addRole(
  participants: Map<string, Set<WalletRole>>,
  candidate: unknown,
  role: WalletRole,
): void {
  const parsed = walletAddressSchema.safeParse(candidate);
  if (!parsed.success) return;
  const roles = participants.get(parsed.data) ?? new Set<WalletRole>();
  roles.add(role);
  participants.set(parsed.data, roles);
}

function participantsForEvent(
  event: IndexedBlockchainEvent,
  notifications: Notification[],
  retainedEvent?: WrenPassEvent,
): Map<string, Set<WalletRole>> {
  const participants = new Map<string, Set<WalletRole>>();
  for (const [field, role] of Object.entries(walletPayloadRoles)) {
    addRole(participants, event.payload[field], role);
  }
  if (retainedEvent) {
    addRole(participants, retainedEvent.customer, "customer");
    addRole(participants, retainedEvent.merchant, "merchant");
    addRole(participants, retainedEvent.owner, "owner");
    addRole(participants, retainedEvent.previousOwner, "previous_owner");
    addRole(participants, retainedEvent.recipient, "recipient");
  }

  for (const notification of notifications) {
    if (!notification.id.startsWith(`${event.id}:`)) continue;
    const role = notificationRoles[notification.type];
    if (role) addRole(participants, notification.recipientWalletAddress, role);
  }
  return participants;
}

function buildReport(input: {
  generatedAt: string;
  profiles: UserProfile[];
  sessions: WalletSession[];
  events: IndexedBlockchainEvent[];
  retainedEvents: WrenPassEvent[];
  notifications: Notification[];
  managedAssets: CloudinaryAssetReference[];
  contractId: string;
}): WalletReport {
  const users = new Map<string, UserWalletReport>();
  const ensureUser = (walletAddress: string): UserWalletReport => {
    const existing = users.get(walletAddress);
    if (existing) return existing;
    const created: UserWalletReport = {
      walletAddress,
      profile: null,
      interactions: {
        blockchain: [],
        walletSessions: [],
        notifications: [],
        managedAssets: [],
      },
      totals: {
        blockchain: 0,
        walletSessions: 0,
        notifications: 0,
        managedAssets: 0,
      },
    };
    users.set(walletAddress, created);
    return created;
  };

  for (const profile of input.profiles) {
    const walletAddress = walletAddressSchema.parse(profile.id);
    ensureUser(walletAddress).profile = {
      ...(profile.email ? { email: profile.email } : {}),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
  const reportGeneratedAt = new Date(input.generatedAt).getTime();
  for (const session of input.sessions) {
    ensureUser(session.address).interactions.walletSessions.push({
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      status: new Date(session.expiresAt).getTime() > reportGeneratedAt ? "active" : "expired",
    });
  }
  for (const notification of input.notifications) {
    ensureUser(notification.recipientWalletAddress).interactions.notifications.push(notification);
  }
  for (const asset of input.managedAssets) {
    ensureUser(asset.ownerWalletAddress).interactions.managedAssets.push(asset);
  }
  const retainedEventsById = new Map(
    input.retainedEvents.map((event) => [event.id, event]),
  );
  const reportEvents = mergeWalletReportEvents({
    indexedEvents: input.events,
    retainedEvents: input.retainedEvents,
    contractId: input.contractId,
    observedAt: input.generatedAt,
  });
  for (const event of reportEvents) {
    const participants = participantsForEvent(
      event,
      input.notifications,
      retainedEventsById.get(event.id),
    );
    for (const [walletAddress, roles] of participants) {
      ensureUser(walletAddress).interactions.blockchain.push({
        ...event,
        roles: [...roles].sort(),
      });
    }
  }

  const userReports = [...users.values()]
    .map((user) => {
      user.interactions.blockchain.sort(
        (left, right) =>
          right.ledger - left.ledger ||
          right.eventIndex - left.eventIndex ||
          right.id.localeCompare(left.id),
      );
      user.interactions.walletSessions.sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      );
      user.interactions.notifications.sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      );
      user.interactions.managedAssets.sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );
      user.totals = {
        blockchain: user.interactions.blockchain.length,
        walletSessions: user.interactions.walletSessions.length,
        notifications: user.interactions.notifications.length,
        managedAssets: user.interactions.managedAssets.length,
      };
      return user;
    })
    .sort((left, right) => left.walletAddress.localeCompare(right.walletAddress));

  return {
    generatedAt: input.generatedAt,
    scope: {
      blockchain:
        "All wallet-associated indexed events plus contract events currently retained by Stellar RPC. source identifies indexed cache records and RPC-recovered records; indexedAt is cache time or RPC observation time, while ledger is authoritative ordering.",
      walletSessions:
        "Verified sessions currently retained in Firestore. Session token hashes and unsigned challenges are intentionally excluded.",
    },
    totals: {
      users: userReports.length,
      blockchainInteractions: userReports.reduce(
        (total, user) => total + user.totals.blockchain,
        0,
      ),
      walletSessions: input.sessions.length,
      notifications: input.notifications.length,
      managedAssets: input.managedAssets.length,
    },
    users: userReports,
  };
}

async function createReport(): Promise<WalletReport> {
  const db = getFirestoreDb();
  const config = getStellarConfig();
  const [profiles, sessions, events, notifications, managedAssets, retainedBatch] = await Promise.all([
    readCollection(db, "user_profiles", userProfileSchema),
    readCollection(db, "walletAuthSessions", walletSessionSchema),
    readCollection(db, "indexed_blockchain_events", indexedBlockchainEventSchema),
    readCollection(db, "notifications", notificationSchema),
    readCollection(db, "cloudinary_asset_references", cloudinaryAssetReferenceSchema),
    new StellarWrenPassEventSource(config).readRetainedEvents(),
  ]);
  return buildReport({
    generatedAt: new Date().toISOString(),
    profiles,
    sessions,
    events,
    retainedEvents: retainedBatch.events,
    notifications,
    managedAssets,
    contractId: config.wrenPassContractId,
  });
}

async function run(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  try {
    const report = await createReport();
    const json = `${JSON.stringify(report, null, options.compact ? undefined : 2)}\n`;
    if (!options.outputPath) {
      process.stdout.write(json);
      return;
    }

    const outputPath = resolve(options.outputPath);
    if (existsSync(outputPath) && !options.force) {
      throw new Error(`Output already exists: ${outputPath}. Pass --force to replace it.`);
    }
    await writeFile(outputPath, json, { encoding: "utf8", flag: options.force ? "w" : "wx" });
    console.error(`Wrote ${report.totals.users} users to ${outputPath}.`);
  } finally {
    await closeFirebaseApp();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Wallet interaction export failed.");
  process.exitCode = 1;
});
