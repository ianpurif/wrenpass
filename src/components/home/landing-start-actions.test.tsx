import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LandingStartActions } from "@/components/home/landing-start-actions";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  push: vi.fn(),
  status: "disconnected" as "checking" | "disconnected" | "connecting" | "connected",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/wallet/wallet-provider", () => ({
  useWallet: () => ({ connect: mocks.connect, status: mocks.status }),
}));

describe("LandingStartActions", () => {
  beforeEach(() => {
    mocks.connect.mockReset();
    mocks.push.mockReset();
    mocks.status = "disconnected";
  });

  it("explains the shared-link customer path and connects merchants directly", async () => {
    mocks.connect.mockResolvedValue(true);
    render(<LandingStartActions />);

    expect(screen.getByText(/customers buy from a campaign link shared directly/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /see a sample campaign/i })).toHaveAttribute(
      "href",
      "#campaign-example",
    );

    await userEvent.setup().click(screen.getByRole("button", { name: /start as a business/i }));

    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith("/merchant");
  });

  it("does not navigate when wallet connection fails", async () => {
    mocks.connect.mockResolvedValue(false);
    render(<LandingStartActions />);

    await userEvent.setup().click(screen.getByRole("button", { name: /start as a business/i }));

    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("gives returning connected users both product destinations", () => {
    mocks.status = "connected";
    render(<LandingStartActions />);

    expect(screen.getByRole("link", { name: /view my passes/i })).toHaveAttribute("href", "/passes");
    expect(screen.getByRole("link", { name: /merchant dashboard/i })).toHaveAttribute("href", "/merchant");
  });
});
