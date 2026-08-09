import "server-only";

import type { Campaign, Pass } from "@/generated/wrenpass-contract/src";
import type {
  RedemptionRequestDto,
  RedemptionScanDto,
} from "@/features/redemption/dto";
import { parseRedemptionQrPayload } from "@/features/redemption/qr";
import type { StellarConfig } from "@/lib/stellar/config";
import type { OffchainRepositories } from "@/server/firestore/repositories";
import { redemptionRequestSchema, type RedemptionRequest } from "@/server/models";

interface RedemptionChainReader {
  findPass(passId: bigint): Promise<Pass | null>;
  findCampaign(campaignId: bigint): Promise<Campaign | null>;
}

interface RedemptionTransactionVerifier {
  verifyMerchantAuthorization(input: {
    serializedTransaction: string;
    passId: bigint;
    merchant: string;
    owner: string;
    expiresAtLedger: number;
  }): Promise<void>;
}

export class RedemptionServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedemptionServiceError";
  }
}

function passIsActive(pass: Pass): boolean {
  return pass.status.tag === "Active";
}

function toScanDto(pass: Pass, campaign: Campaign): RedemptionScanDto {
  return {
    passId: pass.id.toString(),
    campaignId: campaign.id.toString(),
    merchant: campaign.merchant,
    owner: pass.owner,
    expiresAt: new Date(Number(campaign.expires_at) * 1_000).toISOString(),
  };
}

function toRequestDto(request: RedemptionRequest, expiresAt: string): RedemptionRequestDto {
  return {
    id: request.id,
    passId: request.passId,
    campaignId: request.campaignId,
    merchant: request.merchantWalletAddress,
    owner: request.ownerWalletAddress,
    serializedTransaction: request.serializedTransaction,
    expiresAtLedger: request.expiresAtLedger,
    createdAt: request.createdAt,
    expiresAt,
  };
}

export class RedemptionService {
  constructor(
    private readonly config: StellarConfig,
    private readonly repositories: OffchainRepositories,
    private readonly chain: RedemptionChainReader,
    private readonly verifier: RedemptionTransactionVerifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async validateMerchantScan(
    merchantWalletAddress: string,
    encodedQr: string,
  ): Promise<RedemptionScanDto> {
    const payload = parseRedemptionQrPayload(encodedQr);
    if (
      payload.network !== this.config.network ||
      payload.contractId !== this.config.wrenPassContractId
    ) {
      throw new RedemptionServiceError("This pass belongs to a different WrenPass network.");
    }

    const pass = await this.chain.findPass(BigInt(payload.passId));
    if (!pass || pass.id.toString() !== payload.passId) {
      throw new RedemptionServiceError("This pass was not found on Stellar.");
    }
    if (!passIsActive(pass)) {
      throw new RedemptionServiceError("Only an active pass can be redeemed.");
    }

    const campaign = await this.chain.findCampaign(pass.campaign_id);
    if (!campaign) throw new RedemptionServiceError("The pass campaign was not found.");
    if (campaign.merchant !== merchantWalletAddress) {
      throw new RedemptionServiceError("Only this campaign's merchant can start redemption.");
    }
    if (campaign.status.tag !== "Active") {
      throw new RedemptionServiceError("This campaign is not available for redemption.");
    }
    if (campaign.expires_at <= BigInt(Math.floor(this.now().getTime() / 1_000))) {
      throw new RedemptionServiceError("This pass campaign has expired.");
    }

    return toScanDto(pass, campaign);
  }

  async createRequest(
    merchantWalletAddress: string,
    input: {
      qrPayload: string;
      serializedTransaction: string;
      expiresAtLedger: number;
    },
  ): Promise<RedemptionRequestDto> {
    const scan = await this.validateMerchantScan(merchantWalletAddress, input.qrPayload);
    try {
      await this.verifier.verifyMerchantAuthorization({
        serializedTransaction: input.serializedTransaction,
        passId: BigInt(scan.passId),
        merchant: merchantWalletAddress,
        owner: scan.owner,
        expiresAtLedger: input.expiresAtLedger,
      });
    } catch (error) {
      throw new RedemptionServiceError(
        error instanceof Error ? error.message : "The merchant approval is invalid.",
      );
    }

    const existing = await this.repositories.redemptionRequests.findById(scan.passId);
    const timestamp = this.now().toISOString();
    const request = await this.repositories.redemptionRequests.save(
      redemptionRequestSchema.parse({
        id: scan.passId,
        passId: scan.passId,
        campaignId: scan.campaignId,
        contractId: this.config.wrenPassContractId,
        network: this.config.network,
        merchantWalletAddress,
        ownerWalletAddress: scan.owner,
        serializedTransaction: input.serializedTransaction,
        expiresAtLedger: input.expiresAtLedger,
        status: "pending",
        createdAt: existing?.createdAt ?? timestamp,
      }),
    );
    return toRequestDto(request, scan.expiresAt);
  }

  async getPendingRequests(ownerWalletAddress: string): Promise<RedemptionRequestDto[]> {
    const stored = await this.repositories.redemptionRequests.findByField(
      "ownerWalletAddress",
      ownerWalletAddress,
    );
    const requests = await Promise.all(
      stored
        .filter((request) => request.status === "pending")
        .map(async (request): Promise<RedemptionRequestDto | null> => {
          const pass = await this.chain.findPass(BigInt(request.passId));
          if (!pass || !passIsActive(pass) || pass.owner !== ownerWalletAddress) return null;
          const campaign = await this.chain.findCampaign(pass.campaign_id);
          if (!campaign || campaign.merchant !== request.merchantWalletAddress) return null;
          return toRequestDto(request, new Date(Number(campaign.expires_at) * 1_000).toISOString());
        }),
    );
    return requests
      .filter((request): request is RedemptionRequestDto => request !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async completeRequest(
    ownerWalletAddress: string,
    requestId: string,
  ): Promise<void> {
    const request = await this.repositories.redemptionRequests.findById(requestId);
    if (!request || request.ownerWalletAddress !== ownerWalletAddress) {
      throw new RedemptionServiceError("The redemption request was not found.");
    }
    const pass = await this.chain.findPass(BigInt(request.passId));
    if (!pass || pass.owner !== ownerWalletAddress || pass.status.tag !== "Redeemed") {
      throw new RedemptionServiceError("Stellar has not confirmed this pass as redeemed.");
    }
    await this.repositories.redemptionRequests.save({
      ...request,
      status: "completed",
      completedAt: this.now().toISOString(),
    });
  }
}
