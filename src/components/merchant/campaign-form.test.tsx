import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CampaignForm } from "@/components/merchant/campaign-form";
import type { StellarConfig } from "@/lib/stellar/config";

const mocks = vi.hoisted(() => ({
  createDraft: vi.fn(),
  publish: vi.fn(),
  requestReview: vi.fn(),
  registerCampaignMetadata: vi.fn(),
  saveCampaignMetadata: vi.fn(),
  signTransaction: vi.fn(),
  syncEventsAfterMutation: vi.fn(),
}));

vi.mock("@/components/wallet/wallet-provider", () => ({
  useWallet: () => ({
    address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    signTransaction: mocks.signTransaction,
  }),
}));

vi.mock("@/features/merchant/api", () => ({
  merchantApi: {
    saveCampaignMetadata: mocks.saveCampaignMetadata,
    uploadImage: vi.fn(),
  },
}));

vi.mock("@/lib/stellar/wrenpass-client", () => ({
  StellarCampaignContractWriter: class {
    createDraft = mocks.createDraft;
    publish = mocks.publish;
  },
}));
vi.mock("@/lib/stellar/metadata-client", () => ({
  StellarMetadataContractWriter: class {
    registerCampaignMetadata = mocks.registerCampaignMetadata;
  },
}));
vi.mock("@/features/notifications/api", () => ({
  syncEventsAfterMutation: mocks.syncEventsAfterMutation,
}));
vi.mock("@/components/reviews/review-prompt-provider", () => ({
  useReviewPrompt: () => ({ requestReview: mocks.requestReview }),
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

describe("CampaignForm", () => {
  beforeEach(() => {
    mocks.createDraft.mockReset().mockResolvedValue(BigInt(12));
    mocks.publish.mockReset().mockResolvedValue(undefined);
    mocks.requestReview.mockReset();
    mocks.registerCampaignMetadata.mockReset().mockResolvedValue({});
    mocks.saveCampaignMetadata.mockReset().mockResolvedValue({});
    mocks.signTransaction.mockReset();
    mocks.syncEventsAfterMutation.mockReset().mockResolvedValue(true);
  });

  it("creates a contract draft, stores metadata, and publishes in order", async () => {
    const user = userEvent.setup();
    const onPublished = vi.fn().mockResolvedValue(undefined);
    render(<CampaignForm config={config} onPublished={onPublished} />);

    await user.type(screen.getByLabelText("Campaign name"), "Five haircuts forward");
    await user.type(
      screen.getByLabelText("Service description"),
      "One complete haircut service delivered at the merchant studio.",
    );
    await user.click(screen.getByRole("button", { name: "Create and publish campaign" }));

    await waitFor(() => expect(mocks.publish).toHaveBeenCalledOnce());
    expect(mocks.createDraft).toHaveBeenCalledOnce();
    expect(mocks.registerCampaignMetadata).toHaveBeenCalledOnce();
    expect(mocks.saveCampaignMetadata).toHaveBeenCalledWith({
      campaignId: "12",
      name: "Five haircuts forward",
      serviceDescription: "One complete haircut service delivered at the merchant studio.",
    });
    expect(mocks.createDraft.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.registerCampaignMetadata.mock.invocationCallOrder[0],
    );
    expect(mocks.registerCampaignMetadata.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveCampaignMetadata.mock.invocationCallOrder[0],
    );
    expect(mocks.saveCampaignMetadata.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.publish.mock.invocationCallOrder[0],
    );
    expect(onPublished).toHaveBeenCalledOnce();
    expect(mocks.syncEventsAfterMutation).toHaveBeenCalledOnce();
    expect(screen.getByText("Campaign #12 is live on Stellar Testnet.")).toBeInTheDocument();
    expect(mocks.requestReview).toHaveBeenCalledWith({ transactionLabel: "campaign publishing" });
  });

  it("ignores a duplicate submission while the first one is active", async () => {
    const user = userEvent.setup();
    let resolveDraft!: (campaignId: bigint) => void;
    mocks.createDraft.mockReturnValueOnce(new Promise<bigint>((resolve) => {
      resolveDraft = resolve;
    }));
    render(<CampaignForm config={config} onPublished={vi.fn().mockResolvedValue(undefined)} />);

    await user.type(screen.getByLabelText("Campaign name"), "Five haircuts forward");
    await user.type(
      screen.getByLabelText("Service description"),
      "One complete haircut service delivered at the merchant studio.",
    );
    const button = screen.getByRole("button", { name: "Create and publish campaign" });
    const form = button.closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form!);
    fireEvent.submit(form!);

    await waitFor(() => expect(mocks.createDraft).toHaveBeenCalledOnce());
    await act(async () => resolveDraft(BigInt(12)));
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledOnce());
    expect(mocks.createDraft).toHaveBeenCalledOnce();
  });

  it("allows a fresh submission after a failed transaction", async () => {
    const user = userEvent.setup();
    mocks.createDraft
      .mockRejectedValueOnce(new Error("The transaction sequence changed. Please try again."))
      .mockResolvedValueOnce(BigInt(12));
    render(<CampaignForm config={config} onPublished={vi.fn().mockResolvedValue(undefined)} />);

    await user.type(screen.getByLabelText("Campaign name"), "Five haircuts forward");
    await user.type(
      screen.getByLabelText("Service description"),
      "One complete haircut service delivered at the merchant studio.",
    );
    const button = screen.getByRole("button", { name: "Create and publish campaign" });
    await user.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The transaction sequence changed. Please try again.",
    );
    await user.click(button);

    expect(await screen.findByText("Campaign #12 is live on Stellar Testnet.")).toBeInTheDocument();
    expect(mocks.createDraft).toHaveBeenCalledTimes(2);
    expect(mocks.publish).toHaveBeenCalledOnce();
  });
});
