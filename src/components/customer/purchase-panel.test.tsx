import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PurchasePanel } from "@/components/customer/purchase-panel";
import {
  testCustomerAddress,
  testPublicCampaign,
  testStellarConfig,
} from "@/test/fixtures/customer";

const mocks = vi.hoisted(() => ({
  purchase: vi.fn(),
  connect: vi.fn(),
  refreshBalances: vi.fn(),
  signTransaction: vi.fn(),
  refreshRoute: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refreshRoute }) }));
vi.mock("@/components/wallet/wallet-provider", () => ({
  useWallet: () => ({
    address: testCustomerAddress,
    balances: {
      address: testCustomerAddress,
      xlm: "100.0000000",
      asset: { code: "USDC", balance: "20.0000000", hasTrustline: true },
    },
    connect: mocks.connect,
    refreshBalances: mocks.refreshBalances,
    signTransaction: mocks.signTransaction,
    status: "connected",
  }),
}));
vi.mock("@/lib/stellar/wrenpass-client", () => ({
  StellarCustomerContractWriter: class {
    purchase = mocks.purchase;
  },
}));

describe("PurchasePanel", () => {
  beforeEach(() => {
    mocks.purchase.mockReset().mockResolvedValue(BigInt(9));
    mocks.refreshBalances.mockReset().mockResolvedValue(undefined);
    mocks.refreshRoute.mockReset();
  });

  it("shows exact terms before submitting the contract purchase", async () => {
    const user = userEvent.setup();
    render(<PurchasePanel campaign={testPublicCampaign} config={testStellarConfig} />);

    await user.click(screen.getByRole("button", { name: "Buy with USDC" }));
    const dialog = screen.getByRole("dialog", { name: "Buy Future haircut" });
    expect(dialog).toHaveTextContent("5 USDC");
    expect(dialog).toHaveTextContent("6 USDC");
    expect(dialog).toHaveTextContent("1 USDC");

    await user.click(screen.getByRole("button", { name: "Approve 5 USDC" }));
    await waitFor(() => expect(mocks.purchase).toHaveBeenCalledOnce());
    expect(mocks.purchase).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: BigInt(1), customer: testCustomerAddress }),
    );
    expect(await screen.findByText("Pass #9 purchased.")).toBeInTheDocument();
    expect(mocks.refreshBalances).toHaveBeenCalledOnce();
    expect(mocks.refreshRoute).toHaveBeenCalledOnce();
  });

  it("surfaces a rejected wallet transaction", async () => {
    mocks.purchase.mockRejectedValue(new Error("Freighter rejected the transaction."));
    const user = userEvent.setup();
    render(<PurchasePanel campaign={testPublicCampaign} config={testStellarConfig} />);

    await user.click(screen.getByRole("button", { name: "Buy with USDC" }));
    await user.click(screen.getByRole("button", { name: "Approve 5 USDC" }));

    expect(await screen.findByText("Freighter rejected the transaction.")).toBeInTheDocument();
    expect(mocks.refreshRoute).not.toHaveBeenCalled();
  });
});
