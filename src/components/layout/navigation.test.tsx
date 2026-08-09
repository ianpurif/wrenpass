import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Navigation } from "@/components/layout/navigation";

vi.mock("@/components/wallet/wallet-button", () => ({
  WalletButton: () => <button type="button">Connect Freighter</button>,
}));

vi.mock("@/components/wallet/wallet-balance-strip", () => ({
  WalletBalanceStrip: () => null,
}));

describe("Navigation", () => {
  it("toggles the mobile menu with an accessible button", async () => {
    const user = userEvent.setup();

    render(<Navigation />);
    const toggle = screen.getByRole("button", { name: "Open navigation menu" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    toggle.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: "Close navigation menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toHaveFocus();
  });
});
