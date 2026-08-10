import "server-only";

import type { Campaign, Pass } from "@/generated/wrenpass-contract/src";
import type { RedemptionRequest } from "@/generated/redemptions-contract/src";
import type {
  RedemptionRequestPreparationDto,
  RedemptionRequestDto,
  RedemptionScanDto,
} from "@/features/redemption/dto";
import { parseRedemptionQrPayload } from "@/features/redemption/qr";
import type { StellarConfig } from "@/lib/stellar/config";

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

interface RedemptionRequestRegistry {
  prepare(input: {
    merchant: string;
    owner: string;
    passId: bigint;
    serializedTransaction: string;
    expiresAtLedger: number;
  }): Promise<RedemptionRequestPreparationDto>;
  submit(input: {
    merchant: string;
    owner: string;
    passId: bigint;
    serializedTransaction: string;
    expiresAtLedger: number;
    signedAuthorizationEntry: string;
  }): Promise<{ transactionHash: string; ledger: number }>;
  findByOwner(owner: string): Promise<RedemptionRequest[]>;
  findByPass(passId: bigint): Promise<RedemptionRequest | null>;
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
    id: request.pass_id.toString(),
    passId: request.pass_id.toString(),
    campaignId: request.campaign_id.toString(),
    merchant: request.merchant,
    owner: request.owner,
    serializedTransaction: request.serialized_transaction,
    expiresAtLedger: request.expires_at_ledger,
    createdAt: new Date(Number(request.created_at) * 1_000).toISOString(),
    expiresAt,
  };
}

export class RedemptionService {
  constructor(
    private readonly config: StellarConfig,
    private readonly requests: RedemptionRequestRegistry,
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

  private async validateAuthorizedRequest(
    merchantWalletAddress: string,
    input: {
      qrPayload: string;
      serializedTransaction: string;
      expiresAtLedger: number;
    },
  ): Promise<RedemptionScanDto> {
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
    return scan;
  }

  async prepareRequest(
    merchantWalletAddress: string,
    input: {
      qrPayload: string;
      serializedTransaction: string;
      expiresAtLedger: number;
    },
  ): Promise<RedemptionRequestPreparationDto> {
    const scan = await this.validateAuthorizedRequest(merchantWalletAddress, input);
    return this.requests.prepare({
      merchant: merchantWalletAddress,
      owner: scan.owner,
      passId: BigInt(scan.passId),
      serializedTransaction: input.serializedTransaction,
      expiresAtLedger: input.expiresAtLedger,
    });
  }

  async createRequest(
    merchantWalletAddress: string,
    input: {
      qrPayload: string;
      serializedTransaction: string;
      expiresAtLedger: number;
      signedAuthorizationEntry: string;
    },
  ): Promise<RedemptionRequestDto> {
    const scan = await this.validateAuthorizedRequest(merchantWalletAddress, input);
    await this.requests.submit({
      merchant: merchantWalletAddress,
      owner: scan.owner,
      passId: BigInt(scan.passId),
      serializedTransaction: input.serializedTransaction,
      expiresAtLedger: input.expiresAtLedger,
      signedAuthorizationEntry: input.signedAuthorizationEntry,
    });
    const request = await this.requests.findByPass(BigInt(scan.passId));
    if (!request) {
      throw new RedemptionServiceError(
        "Stellar confirmed the request but it could not be read back.",
      );
    }
    return toRequestDto(request, scan.expiresAt);
  }

  async getPendingRequests(ownerWalletAddress: string): Promise<RedemptionRequestDto[]> {
    const stored = await this.requests.findByOwner(ownerWalletAddress);
    const requests = await Promise.all(
      stored.map(async (request): Promise<RedemptionRequestDto | null> => {
        const pass = await this.chain.findPass(request.pass_id);
        if (!pass || !passIsActive(pass) || pass.owner !== ownerWalletAddress) return null;
        const campaign = await this.chain.findCampaign(pass.campaign_id);
        if (!campaign || campaign.merchant !== request.merchant) return null;
        return toRequestDto(
          request,
          new Date(Number(campaign.expires_at) * 1_000).toISOString(),
        );
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
    const pass = await this.chain.findPass(BigInt(requestId));
    if (!pass || pass.owner !== ownerWalletAddress || pass.status.tag !== "Redeemed") {
      throw new RedemptionServiceError("Stellar has not confirmed this pass as redeemed.");
    }
  }
}
