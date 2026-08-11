import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CampaignTransactions } from "@/components/campaigns/campaign-transactions";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@/features/campaign-transactions/api", () => ({
  campaignTransactionsApi: { list: mocks.list },
}));

function transaction(id: string, passId: string, hashCharacter: string) {
  return {
    id,
    transactionHash: hashCharacter.repeat(64),
    passId,
    total: "50000000",
    ledger: 1_234_500 + Number(passId),
  };
}

describe("CampaignTransactions", () => {
  beforeEach(() => mocks.list.mockReset());

  it("shows the initial page and incrementally loads the next page", async () => {
    mocks.list.mockResolvedValue({
      transactions: [transaction("event-3", "3", "c")],
      nextCursor: null,
      hasMore: false,
    });
    const user = userEvent.setup();
    render(
      <CampaignTransactions
        assetCode="USDC"
        campaignId="1"
        initialPage={{
          transactions: [
            transaction("event-2", "2", "b"),
            transaction("event-1", "1", "a"),
          ],
          nextCursor: "next-page",
          hasMore: true,
        }}
        network="testnet"
      />,
    );

    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /View on-chain/ })[0]).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${"b".repeat(64)}`,
    );

    await user.click(screen.getByRole("button", { name: "Load 10 more" }));

    expect(await screen.findByText("#3")).toBeInTheDocument();
    await waitFor(() => expect(mocks.list).toHaveBeenCalledWith({
      campaignId: "1",
      cursor: "next-page",
      limit: 10,
    }));
    expect(screen.queryByRole("button", { name: "Load 10 more" })).not.toBeInTheDocument();
  });
});
