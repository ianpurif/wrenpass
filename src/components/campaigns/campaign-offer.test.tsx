import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CampaignOffer } from "@/components/campaigns/campaign-offer";
import { testPublicCampaign, testStellarConfig } from "@/test/fixtures/customer";

vi.mock("@/components/customer/purchase-panel", () => ({
  PurchasePanel: () => (
    <section aria-label="Pass terms">
      <p>Pay today</p>
      <button type="button">Buy with USDC</button>
    </section>
  ),
}));

describe("CampaignOffer", () => {
  it("keeps campaign information and the purchase action in one offer surface", () => {
    render(<CampaignOffer campaign={testPublicCampaign} config={testStellarConfig} />);

    const offer = screen.getByRole("article", { name: "Future haircut" });
    expect(within(offer).getByText("Active")).toBeInTheDocument();
    expect(within(offer).getByText("Campaign / 000001")).toBeInTheDocument();
    expect(within(offer).getByText(testPublicCampaign.metadata.serviceDescription)).toBeInTheDocument();
    expect(within(offer).getByText("Pay today")).toBeInTheDocument();
    expect(within(offer).getByRole("button", { name: "Buy with USDC" })).toBeInTheDocument();
  });
});
