import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ReviewPromptProvider,
  useReviewPrompt,
} from "@/components/reviews/review-prompt-provider";
import { testCustomerAddress, testStellarConfig } from "@/test/fixtures/customer";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  signAuthEntry: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/components/wallet/wallet-provider", () => ({
  useWallet: () => ({
    address: testCustomerAddress,
    signAuthEntry: mocks.signAuthEntry,
  }),
}));

vi.mock("@/lib/stellar/reviews-client", () => ({
  StellarReviewContractWriter: class {
    submit = mocks.submit;
  },
}));

function TransactionSuccessTrigger() {
  const { requestReview } = useReviewPrompt();
  return (
    <button type="button" onClick={() => requestReview({
      promptTitle: "Buy with USDC successful",
      transactionLabel: "Buy with USDC",
    })}>
      Complete transaction
    </button>
  );
}

describe("ReviewPromptProvider", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.signAuthEntry.mockReset();
    mocks.submit.mockReset().mockResolvedValue({
      reviewId: "7",
      transactionHash: "a".repeat(64),
      ledger: 123,
    });
  });

  it("publishes a wallet-authorized rating and message after a transaction", async () => {
    const user = userEvent.setup();
    render(
      <ReviewPromptProvider config={testStellarConfig}>
        <TransactionSuccessTrigger />
      </ReviewPromptProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Complete transaction" }));
    expect(screen.getByRole("dialog", { name: "Buy with USDC successful" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "5 stars" }));
    await user.type(screen.getByLabelText("Review message"), "Fast, clear, and easy to trust.");
    await user.click(screen.getByRole("button", { name: "Publish review" }));

    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({
      reviewer: testCustomerAddress,
      rating: 5,
      message: "Fast, clear, and easy to trust.",
      signAuthEntry: expect.any(Function),
    }));
    expect(await screen.findByRole("heading", { name: "Review successful" })).toBeInTheDocument();
    expect(screen.getByText(/Review #7 is stored on Stellar/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View on-chain/i })).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${"a".repeat(64)}`,
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps invalid feedback off-chain", async () => {
    const user = userEvent.setup();
    render(
      <ReviewPromptProvider config={testStellarConfig}>
        <TransactionSuccessTrigger />
      </ReviewPromptProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Complete transaction" }));
    await user.type(screen.getByLabelText("Review message"), "Helpful experience");
    await user.click(screen.getByRole("button", { name: "Publish review" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a star rating.");
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
