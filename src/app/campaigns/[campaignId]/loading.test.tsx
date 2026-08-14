import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CampaignLoading from "@/app/campaigns/[campaignId]/loading";

describe("CampaignLoading", () => {
  it("provides immediate, accessible feedback while the public campaign streams", () => {
    render(<CampaignLoading />);

    expect(screen.getByRole("status", { name: "Loading campaign" })).toHaveTextContent(
      "Loading campaign details and on-chain activity",
    );
  });
});
