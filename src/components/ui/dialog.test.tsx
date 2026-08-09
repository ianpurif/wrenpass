import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "@/components/ui/dialog";

describe("Dialog", () => {
  it("exposes an accessible title and closes with Escape", async () => {
    const user = userEvent.setup();
    const handleOpenChange = vi.fn();

    render(
      <Dialog open title="Campaign terms" onOpenChange={handleOpenChange}>
        <p>Terms content</p>
      </Dialog>,
    );

    expect(screen.getByRole("dialog", { name: "Campaign terms" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps keyboard focus inside the modal", async () => {
    const user = userEvent.setup();

    render(
      <Dialog open title="Campaign terms" onOpenChange={vi.fn()}>
        <button type="button">Accept terms</button>
      </Dialog>,
    );

    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "Accept terms" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
  });
});
