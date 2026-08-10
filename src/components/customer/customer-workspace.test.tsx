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
  getDashboard: vi.fn(),
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
  customerApi: { getDashboard: mocks.getDashboard },
}));

describe("CustomerWorkspace", () => {
  beforeEach(() => {
    mocks.getDashboard.mockReset();
    mocks.walletAddress = testCustomerAddress;
    mocks.walletStatus = "connected";
  });

  it("shows current pass states and retained purchase, gift, and receipt history", async () => {
    mocks.getDashboard.mockResolvedValue({
      passes: [testCustomerPass, { ...testCustomerPass, id: "2", status: "Redeemed" }],
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
    expect(screen.getByRole("heading", { name: "Owned passes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recent activity" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Activity" }));
    expect(screen.getByRole("heading", { name: "Recent activity" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Owned passes" })).not.toBeInTheDocument();
    expect(screen.getByText("Purchased")).toBeInTheDocument();
    expect(screen.getByText("Gifted")).toBeInTheDocument();
    expect(screen.getByText("Received")).toBeInTheDocument();
    expect(screen.getByText("5 USDC")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Owned Passes" }));
    expect(screen.getByRole("heading", { name: "Owned passes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recent activity" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Redeemed 1" }));
    expect(screen.getByText("Owned pass 2")).toBeInTheDocument();
    expect(mocks.getDashboard).toHaveBeenCalledTimes(1);
    expect(mocks.getDashboard).toHaveBeenCalledWith(
      testCustomerAddress,
      { signal: expect.any(AbortSignal) },
    );
  });

  it("does not fetch until the verified wallet session is connected", async () => {
    mocks.walletAddress = null;
    mocks.walletStatus = "checking";
    mocks.getDashboard.mockResolvedValue({
      passes: [],
      activity: [],
      activityWindowStartsAt: "2026-08-02T00:00:00.000Z",
    });
    const workspace = render(<CustomerWorkspace config={testStellarConfig} />);

    expect(screen.getByText("Checking your wallet session")).toBeInTheDocument();
    expect(mocks.getDashboard).not.toHaveBeenCalled();

    mocks.walletAddress = testCustomerAddress;
    mocks.walletStatus = "connected";
    workspace.rerender(<CustomerWorkspace config={testStellarConfig} />);

    expect(await screen.findByRole("heading", { name: "My passes" })).toBeInTheDocument();
    expect(mocks.getDashboard).toHaveBeenCalledOnce();
  });

  it("shows a retryable error instead of remaining in the loading state", async () => {
    mocks.getDashboard.mockRejectedValue(new Error("Stellar is temporarily unavailable."));

    render(<CustomerWorkspace config={testStellarConfig} />);

    expect(await screen.findByText("Stellar is temporarily unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("Reading passes from Stellar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("keeps a successful dashboard visible when a later refresh fails", async () => {
    mocks.getDashboard
      .mockResolvedValueOnce({
        passes: [testCustomerPass],
        activity: [],
        activityWindowStartsAt: "2026-08-02T00:00:00.000Z",
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
});
