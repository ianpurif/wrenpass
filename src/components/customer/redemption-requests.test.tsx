import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RedemptionRequests } from "@/components/customer/redemption-requests";
import {
  testRecipientAddress as owner,
  testStellarConfig,
  testCustomerAddress as merchant,
} from "@/test/fixtures/customer";

const mocks = vi.hoisted(() => ({
  getPending: vi.fn(),
  requestReview: vi.fn(),
  complete: vi.fn(),
  syncEventsAfterMutation: vi.fn(),
  approveAndSubmit: vi.fn(),
  signTransaction: vi.fn(),
}));

vi.mock("@/components/wallet/wallet-provider", () => ({
  useWallet: () => ({ address: owner, signTransaction: mocks.signTransaction }),
}));
vi.mock("@/features/redemption/api", () => ({
  redemptionApi: { getPending: mocks.getPending, complete: mocks.complete },
}));
vi.mock("@/features/notifications/api", () => ({
  syncEventsAfterMutation: mocks.syncEventsAfterMutation,
}));
vi.mock("@/lib/stellar/wrenpass-client", () => ({
  StellarRedemptionContractWriter: class {
    approveAndSubmit = mocks.approveAndSubmit;
  },
}));
vi.mock("@/components/reviews/review-prompt-provider", () => ({
  useReviewPrompt: () => ({ requestReview: mocks.requestReview }),
}));

const request = {
  id: "1",
  passId: "1",
  campaignId: "1",
  merchant,
  owner,
  serializedTransaction: "merchant-authorized-transaction",
  expiresAtLedger: 1_234_567,
  createdAt: "2026-08-09T10:00:00.000Z",
  expiresAt: "2026-11-08T03:00:00.000Z",
};

describe("RedemptionRequests", () => {
  it("submits only after the current owner explicitly approves", async () => {
    mocks.getPending.mockResolvedValueOnce([request]).mockResolvedValueOnce([]);
    mocks.approveAndSubmit.mockResolvedValue({ transactionHash: "a".repeat(64) });
    mocks.complete.mockResolvedValue(undefined);
    mocks.syncEventsAfterMutation.mockResolvedValue(true);
    mocks.requestReview.mockReset();
    const onRedeemed = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<RedemptionRequests config={testStellarConfig} onRedeemed={onRedeemed} />);
    await user.click(await screen.findByRole("button", { name: "Approve and redeem" }));

    expect(mocks.approveAndSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        owner,
        serializedTransaction: request.serializedTransaction,
        signTransaction: expect.any(Function),
      }),
    );
    expect(mocks.complete).toHaveBeenCalledWith("1", "a".repeat(64));
    await waitFor(() => expect(onRedeemed).toHaveBeenCalled());
    expect(mocks.syncEventsAfterMutation).toHaveBeenCalledOnce();
    expect(mocks.requestReview).toHaveBeenCalledWith({ transactionLabel: "pass redemption" });
  });
});
