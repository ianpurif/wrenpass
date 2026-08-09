import "server-only";

import type { Pass } from "@/generated/wrenpass-contract/src";
import type {
  CustomerDashboardDto,
  CustomerPassDto,
} from "@/features/customer/dto";
import type { PublicCampaignDto } from "@/features/merchant/dto";
import type { CustomerChainReader } from "@/server/stellar/customer-chain-reader";

const MAX_DIRECT_PASS_READS = BigInt(2_000);
const PASS_READ_BATCH_SIZE = 20;

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

  async getDashboard(walletAddress: string): Promise<CustomerDashboardDto> {
    const [passCount, activityWindow] = await Promise.all([
      this.chainReader.getPassCount(),
      this.chainReader.readRecentActivity(walletAddress),
    ]);
    if (passCount > MAX_DIRECT_PASS_READS) {
      throw new CustomerServiceError(
        "The direct pass reader reached its safe limit. Event indexing is required before loading this account.",
      );
    }

    const ownedPasses: Pass[] = [];
    const count = Number(passCount);
    for (let start = 1; start <= count; start += PASS_READ_BATCH_SIZE) {
      const end = Math.min(count, start + PASS_READ_BATCH_SIZE - 1);
      const batch = await Promise.all(
        Array.from({ length: end - start + 1 }, (_, index) =>
          this.chainReader.findPass(BigInt(start + index)),
        ),
      );
      ownedPasses.push(
        ...batch.filter((pass): pass is Pass => pass !== null && pass.owner === walletAddress),
      );
    }

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

    return {
      passes,
      activity: activityWindow.activity,
      activityWindowStartsAt: activityWindow.startsAt,
    };
  }
}
