import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MerchantWorkspace } from "@/components/merchant/merchant-workspace";
import { campaignTableGridClass } from "@/components/merchant/campaign-table-layout";
import type { StellarConfig } from "@/lib/stellar/config";

const mocks = vi.hoisted(() => ({ getDashboard: vi.fn(), syncEvents: vi.fn() }));

vi.mock("@/components/wallet/wallet-provider", () => ({
  useWallet: () => ({
    address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    connect: vi.fn(),
    status: "connected",
  }),
}));

vi.mock("@/components/merchant/campaign-form", () => ({
  CampaignForm: () => <div>Campaign form</div>,
}));

vi.mock("@/components/merchant/profile-form", () => ({
  MerchantProfileForm: () => <div>Profile form</div>,
}));
vi.mock("@/components/merchant/redemption-scanner", () => ({ RedemptionScanner: () => <div>Redemption scanner</div> }));
vi.mock("@/components/notifications/notification-email-form", () => ({ NotificationEmailForm: () => null }));

vi.mock("@/features/merchant/api", () => ({
  merchantApi: { getDashboard: mocks.getDashboard },
}));
vi.mock("@/features/notifications/api", () => ({
  notificationApi: { syncEvents: mocks.syncEvents },
}));

const config: StellarConfig = {
  network: "testnet",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  assetCode: "USDC",
  assetIssuer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  assetContractId: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  wrenPassContractId: "CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D",
  reviewContractId: "CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D",
  metadataContractId: "CCPREVJISOBTO25UJSS53YIA7UMRXCYLUTJBA5K4CSGLTRI4P4IOVFDR",
  redemptionContractId: "CCPREVJISOBTO25UJSS53YIA7UMRXCYLUTJBA5K4CSGLTRI4P4IOVFDR",
};

describe("MerchantWorkspace", () => {
  it("derives financial totals from current on-chain campaign fields", async () => {
    mocks.getDashboard.mockResolvedValue({
      merchant: {
        id: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        ownerWalletAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        businessName: "Wren Studio",
        description: "A neighborhood studio providing complete haircut services.",
        createdAt: "2026-08-09T00:00:00.000Z",
        updatedAt: "2026-08-09T00:00:00.000Z",
      },
      campaigns: [
        {
          metadata: {
            id: "1",
            contractId: config.wrenPassContractId,
            merchantId: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
            name: "Future haircut",
            serviceDescription: "One complete haircut service at the merchant location.",
            createdAt: "2026-08-09T00:00:00.000Z",
            updatedAt: "2026-08-09T00:00:00.000Z",
          },
          onchain: {
            id: "1",
            merchant: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
            passPrice: "50000000",
            serviceValue: "60000000",
            maxSupply: 100,
            sold: 3,
            remaining: 97,
            redeemed: 1,
            refunded: 0,
            merchantReleased: "112500000",
            protectedFunds: "30000000",
            platformFeesPaid: "7500000",
            expiresAt: "2000000000",
            financialRules: {
              merchantBps: 7_500,
              reserveBps: 2_000,
              platformFeeBps: 500,
            },
            status: "Active",
          },
        },
      ],
    });

    const workspace = render(<MerchantWorkspace config={config} />);

    expect(await screen.findByRole("heading", { name: "Wren Studio" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Business profile" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Redeem pass" })).toHaveAttribute("href", "/merchant/redeem-pass");
    expect(screen.getByRole("link", { name: "New campaign" })).toHaveAttribute("href", "/merchant/create-campaign");
    expect(screen.queryByRole("link", { name: "Merchant overview" })).not.toBeInTheDocument();
    expect(screen.queryByText("Profile form")).not.toBeInTheDocument();
    expect(screen.queryByText("Redemption scanner")).not.toBeInTheDocument();
    expect(screen.queryByText("Campaign form")).not.toBeInTheDocument();
    expect(screen.getAllByText("15 USDC").length).toBeGreaterThan(0);
    expect(screen.getByText("11.25 USDC")).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("97").length).toBeGreaterThan(0);
    const campaignHeader = screen.getByText("Actions").parentElement;
    const campaignRow = screen.getByRole("heading", { name: "Future haircut" }).closest("article")?.firstElementChild;
    expect(campaignHeader).toHaveClass(campaignTableGridClass);
    expect(campaignRow).toHaveClass(campaignTableGridClass);
    expect(screen.getByRole("link", { name: "View" }).parentElement).toHaveClass("gap-2", "lg:flex-nowrap");

    workspace.rerender(<MerchantWorkspace config={config} page="business-identity" />);
    expect(screen.getByText("Profile form")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Merchant overview" })).toHaveAttribute("href", "/merchant");

    workspace.rerender(<MerchantWorkspace config={config} page="redeem-pass" />);
    expect(screen.getByText("Redemption scanner")).toBeInTheDocument();

    workspace.rerender(<MerchantWorkspace config={config} page="create-campaign" />);
    expect(screen.getByText("Campaign form")).toBeInTheDocument();
    expect(mocks.syncEvents).not.toHaveBeenCalled();
  });
});
