import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomerWorkspace } from "@/components/customer/customer-workspace";
import {
  testCustomerAddress,
  testCustomerPass,
  testRecipientAddress,
  testStellarConfig,
} from "@/test/fixtures/customer";

const mocks = vi.hoisted(() => ({
  getActivity: vi.fn(),
  getPasses: vi.fn(),
  walletAddress: null as string | null,
  walletStatus: "checking" as "checking" | "disconnected" | "connecting" | "connected",
}));

vi.mock("@/components/wallet/wallet-provider", () => ({
  useWallet: () => ({
    address: mocks.walletAddress,
    connect: vi.fn(),
    error: null,
    status: mocks.walletStatus,
  }),
}));
vi.mock("@/components/customer/customer-pass-card", () => ({
  CustomerPassCard: ({ pass }: { pass: { id: string } }) => <div>Owned pass {pass.id}</div>,
}));
vi.mock("@/components/customer/redemption-requests", () => ({ RedemptionRequests: () => null }));
vi.mock("@/features/customer/api", () => ({
  customerApi: { getActivity: mocks.getActivity, getPasses: mocks.getPasses },
}));

describe("CustomerWorkspace", () => {
  beforeEach(() => {
    mocks.getActivity.mockReset().mockResolvedValue({
      activity: [],
      activityWindowStartsAt: "2026-08-02T00:00:00.000Z",
    });
    mocks.getPasses.mockReset();
    mocks.walletAddress = testCustomerAddress;
    mocks.walletStatus = "connected";
  });

  it("shows current pass states and retained purchase, gift, and receipt history", async () => {
    mocks.getPasses.mockResolvedValue({
      passes: [testCustomerPass, { ...testCustomerPass, id: "2", status: "Redeemed" }],
    });
    mocks.getActivity.mockResolvedValue({
      activityWindowStartsAt: "2026-08-02T00:00:00.000Z",
      activity: [
        { id: "purchase", kind: "Purchased", campaignId: "1", passId: "1", occurredAt: "2026-08-09T08:00:00.000Z", transactionHash: "a".repeat(64), amount: "50000000" },
        { id: "gift", kind: "Gifted", campaignId: "1", passId: "3", occurredAt: "2026-08-09T08:01:00.000Z", transactionHash: "b".repeat(64), counterparty: testRecipientAddress },
        { id: "received", kind: "Received", campaignId: "1", passId: "4", occurredAt: "2026-08-09T08:02:00.000Z", transactionHash: "c".repeat(64), counterparty: testRecipientAddress },
      ],
    });
    const user = userEvent.setup();
    render(<CustomerWorkspace config={testStellarConfig} />);

    expect(await screen.findByText("Owned pass 1")).toBeInTheDocument();
    expect(mocks.getActivity).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Owned passes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recent activity" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Activity" }));
    expect(screen.getByRole("heading", { name: "Recent activity" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Owned passes" })).not.toBeInTheDocument();
    expect(await screen.findByText("Purchased")).toBeInTheDocument();
    expect(screen.getByText("Gifted")).toBeInTheDocument();
    expect(screen.getByText("Received")).toBeInTheDocument();
    expect(screen.getByText("5 USDC")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /View on-chain/ })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: `https://stellar.expert/explorer/testnet/tx/${"a".repeat(64)}`,
        }),
      ]),
    );

    await user.click(screen.getByRole("tab", { name: "Owned Passes" }));
    expect(screen.getByRole("heading", { name: "Owned passes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recent activity" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Redeemed passes: 1" }));
    expect(screen.getByText("Owned pass 2")).toBeInTheDocument();
    expect(mocks.getPasses).toHaveBeenCalledTimes(1);
    expect(mocks.getPasses).toHaveBeenCalledWith(
      testCustomerAddress,
      { signal: expect.any(AbortSignal) },
    );
    expect(mocks.getActivity).toHaveBeenCalledOnce();
  });

  it("does not fetch until the verified wallet session is connected", async () => {
    mocks.walletAddress = null;
    mocks.walletStatus = "checking";
    mocks.getPasses.mockResolvedValue({
      passes: [],
    });
    const workspace = render(<CustomerWorkspace config={testStellarConfig} />);

    expect(screen.getByText("Checking your wallet session")).toBeInTheDocument();
    expect(mocks.getPasses).not.toHaveBeenCalled();

    mocks.walletAddress = testCustomerAddress;
    mocks.walletStatus = "connected";
    workspace.rerender(<CustomerWorkspace config={testStellarConfig} />);

    expect(await screen.findByRole("heading", { name: "My passes" })).toBeInTheDocument();
    expect(mocks.getPasses).toHaveBeenCalledOnce();
  });

  it("shows a retryable error instead of remaining in the loading state", async () => {
    mocks.getPasses.mockRejectedValue(new Error("Stellar is temporarily unavailable."));

    render(<CustomerWorkspace config={testStellarConfig} />);

    expect(await screen.findByText("Stellar is temporarily unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("Reading passes from Stellar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("keeps a successful dashboard visible when a later refresh fails", async () => {
    mocks.getPasses
      .mockResolvedValueOnce({
        passes: [testCustomerPass],
      })
      .mockRejectedValueOnce(new Error("The refresh could not reach Stellar."));
    const user = userEvent.setup();
    render(<CustomerWorkspace config={testStellarConfig} />);

    expect(await screen.findByText("Owned pass 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("The refresh could not reach Stellar.")).toBeInTheDocument();
    expect(screen.getByText("Owned pass 1")).toBeInTheDocument();
    expect(screen.queryByText("Reading passes from Stellar")).not.toBeInTheDocument();
  });

  it("keeps pass management usable when the optional activity request fails", async () => {
    mocks.getPasses.mockResolvedValue({ passes: [testCustomerPass] });
    mocks.getActivity.mockRejectedValue(new Error("Recent activity is temporarily unavailable."));
    const user = userEvent.setup();
    render(<CustomerWorkspace config={testStellarConfig} />);

    expect(await screen.findByText("Owned pass 1")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Activity" }));

    expect(await screen.findByText("Recent activity is temporarily unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("Owned pass 1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
