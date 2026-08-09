import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MerchantWorkspace } from "@/components/merchant/merchant-workspace";
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
};

describe("MerchantWorkspace", () => {
  it("derives financial totals from current on-chain campaign fields", async () => {
    mocks.syncEvents.mockResolvedValue({ indexed: 0, duplicates: 0, notificationsSent: 0, notificationFailures: 0 });
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

    render(<MerchantWorkspace config={config} />);

    expect(await screen.findByRole("heading", { name: "Wren Studio" })).toBeInTheDocument();
    expect(screen.getByText("15 USDC")).toBeInTheDocument();
    expect(screen.getByText("11.25 USDC")).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(screen.getByText("97")).toBeInTheDocument();
  });
});
