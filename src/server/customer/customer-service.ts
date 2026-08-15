import "server-only";

import type { Pass } from "@/generated/wrenpass-contract/src";
import type {
  CustomerDashboardDto,
  CustomerPassDto,
} from "@/features/customer/dto";
import type { PublicCampaignDto } from "@/features/merchant/dto";
import type { CustomerChainReader } from "@/server/stellar/customer-chain-reader";

interface CampaignCatalog {
  getPublicCampaign(campaignId: string): Promise<PublicCampaignDto | null>;
}

export class CustomerServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerServiceError";
  }
}

function toPassDto(pass: Pass, campaign: PublicCampaignDto | null): CustomerPassDto {
  return {
    id: pass.id.toString(),
    campaignId: pass.campaign_id.toString(),
    owner: pass.owner,
    status: pass.status.tag,
    purchasedAt: pass.purchased_at.toString(),
    purchaseAmounts: {
      total: pass.purchase_amounts.total.toString(),
      merchantRelease: pass.purchase_amounts.merchant_release.toString(),
      protectedReserve: pass.purchase_amounts.protected_reserve.toString(),
      platformFee: pass.purchase_amounts.platform_fee.toString(),
    },
    campaign,
  };
}

export class CustomerService {
  constructor(
    private readonly chainReader: CustomerChainReader,
    private readonly campaigns: CampaignCatalog,
  ) {}

  async getPasses(walletAddress: string): Promise<CustomerDashboardDto["passes"]> {
    const ownedPasses = await this.chainReader.getOwnedPasses(walletAddress);

    const campaignIds = [...new Set(ownedPasses.map((pass) => pass.campaign_id.toString()))];
    const campaignEntries = await Promise.all(
      campaignIds.map(async (campaignId) => [
        campaignId,
        await this.campaigns.getPublicCampaign(campaignId),
      ] as const),
    );
    const campaignMap = new Map(campaignEntries);
    const passes = ownedPasses
      .map((pass) => toPassDto(pass, campaignMap.get(pass.campaign_id.toString()) ?? null))
      .sort((left, right) => {
        const leftTime = BigInt(left.purchasedAt);
        const rightTime = BigInt(right.purchasedAt);
        return leftTime === rightTime ? 0 : leftTime < rightTime ? 1 : -1;
      });

    return passes;
  }

  async getActivity(walletAddress: string): Promise<Pick<CustomerDashboardDto, "activity" | "activityWindowStartsAt">> {
    const activityWindow = await this.chainReader.readRecentActivity(walletAddress);
    return {
      activity: activityWindow.activity,
      activityWindowStartsAt: activityWindow.startsAt,
    };
  }

  async getDashboard(walletAddress: string): Promise<CustomerDashboardDto> {
    const [passes, activityWindow] = await Promise.all([
      this.getPasses(walletAddress),
      this.getActivity(walletAddress),
    ]);
    return { passes, ...activityWindow };
  }
}
