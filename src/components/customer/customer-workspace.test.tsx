import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CustomerWorkspace } from "@/components/customer/customer-workspace";
import {
  testCustomerAddress,
  testCustomerPass,
  testRecipientAddress,
  testStellarConfig,
} from "@/test/fixtures/customer";

const mocks = vi.hoisted(() => ({ getDashboard: vi.fn(), syncEvents: vi.fn() }));

vi.mock("@/components/wallet/wallet-provider", () => ({
  useWallet: () => ({
    address: testCustomerAddress,
    connect: vi.fn(),
    error: null,
    status: "connected",
  }),
}));
vi.mock("@/components/customer/customer-pass-card", () => ({
  CustomerPassCard: ({ pass }: { pass: { id: string } }) => <div>Owned pass {pass.id}</div>,
}));
vi.mock("@/components/customer/redemption-requests", () => ({ RedemptionRequests: () => null }));
vi.mock("@/components/notifications/notification-email-form", () => ({ NotificationEmailForm: () => null }));
vi.mock("@/features/customer/api", () => ({
  customerApi: { getDashboard: mocks.getDashboard },
}));
vi.mock("@/features/notifications/api", () => ({
  notificationApi: { syncEvents: mocks.syncEvents },
}));

describe("CustomerWorkspace", () => {
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
    mocks.syncEvents.mockResolvedValue({ indexed: 0, duplicates: 0, notificationsSent: 0, notificationFailures: 0 });

    const user = userEvent.setup();
    render(<CustomerWorkspace config={testStellarConfig} />);

    expect(await screen.findByText("Owned pass 1")).toBeInTheDocument();
    expect(screen.getByText("Purchase history")).toBeInTheDocument();
    expect(screen.getByText("Gifted passes")).toBeInTheDocument();
    expect(screen.getByText("Received passes")).toBeInTheDocument();
    expect(screen.getByText("Redeemed passes")).toBeInTheDocument();
    expect(screen.getByText("Refunded passes")).toBeInTheDocument();
    expect(screen.getByText("5 USDC")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Redeemed 1" }));
    expect(screen.getByText("Owned pass 2")).toBeInTheDocument();
  });
});
