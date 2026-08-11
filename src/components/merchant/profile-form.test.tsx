import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MerchantProfileForm } from "@/components/merchant/profile-form";
import type { StellarConfig } from "@/lib/stellar/config";

const walletAddress = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const mocks = vi.hoisted(() => ({
  saveProfile: vi.fn(),
  setMerchantProfile: vi.fn(),
  signTransaction: vi.fn(),
}));

vi.mock("@/components/wallet/wallet-provider", () => ({
  useWallet: () => ({ address: walletAddress, signTransaction: mocks.signTransaction }),
}));
vi.mock("@/features/merchant/api", () => ({
  merchantApi: {
    saveProfile: mocks.saveProfile,
    uploadImage: vi.fn(),
  },
}));
vi.mock("@/lib/stellar/metadata-client", () => ({
  StellarMetadataContractWriter: class {
    setMerchantProfile = mocks.setMerchantProfile;
  },
}));

const config: StellarConfig = {
  network: "testnet",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  assetCode: "USDC",
  assetIssuer: walletAddress,
  assetContractId: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  wrenPassContractId: "CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D",
  reviewContractId: "CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D",
  metadataContractId: "CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D",
  redemptionContractId: "CCPREVJISOBTO25UJSS53YIA7UMRXCYLUTJBA5K4CSGLTRI4P4IOVFDR",
};

describe("MerchantProfileForm", () => {
  beforeEach(() => {
    mocks.saveProfile.mockReset().mockResolvedValue({
      id: walletAddress,
      ownerWalletAddress: walletAddress,
      businessName: "Wren Studio",
      description: "A neighborhood studio providing complete haircut services.",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    });
    mocks.setMerchantProfile.mockReset().mockResolvedValue({});
    mocks.signTransaction.mockReset();
  });

  it("writes the wallet-authorized profile on-chain before caching it", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <MerchantProfileForm
        config={config}
        merchant={null}
        onSaved={onSaved}
      />,
    );

    await user.type(screen.getByLabelText("Business name"), "Wren Studio");
    await user.type(
      screen.getByLabelText("Business description"),
      "A neighborhood studio providing complete haircut services.",
    );
    await user.click(screen.getByRole("button", { name: "Save merchant profile" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(mocks.setMerchantProfile).toHaveBeenCalledWith({
      merchant: walletAddress,
      profile: {
        businessName: "Wren Studio",
        description: "A neighborhood studio providing complete haircut services.",
      },
      signTransaction: expect.any(Function),
    });
    expect(mocks.setMerchantProfile.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveProfile.mock.invocationCallOrder[0],
    );
  });

  it("shows the currently uploaded business logo and hosted filename", () => {
    render(
      <MerchantProfileForm
        config={config}
        merchant={{
          id: walletAddress,
          ownerWalletAddress: walletAddress,
          businessName: "Wren Studio",
          description: "A neighborhood studio providing complete haircut services.",
          logoUrl: "https://res.cloudinary.com/wrenpass/image/upload/current-logo.png",
          createdAt: "2026-08-10T00:00:00.000Z",
          updatedAt: "2026-08-10T00:00:00.000Z",
        }}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: "Current image preview: current-logo.png" })).toBeInTheDocument();
    expect(screen.getByText("current-logo.png")).toBeInTheDocument();
  });
});
