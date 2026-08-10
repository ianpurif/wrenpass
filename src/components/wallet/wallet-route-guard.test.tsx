import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WalletRouteGuard } from "@/components/wallet/wallet-route-guard";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), walletStatus: "checking" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/components/wallet/wallet-provider", () => ({
  useWallet: () => ({ status: mocks.walletStatus }),
}));

describe("WalletRouteGuard", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.walletStatus = "checking";
  });

  it("renders protected content only for a connected wallet", () => {
    mocks.walletStatus = "connected";

    render(<WalletRouteGuard><p>Protected merchant content</p></WalletRouteGuard>);

    expect(screen.getByText("Protected merchant content")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("redirects disconnected users without rendering protected content", async () => {
    mocks.walletStatus = "disconnected";

    render(<WalletRouteGuard><p>Protected merchant content</p></WalletRouteGuard>);

    expect(screen.queryByText("Protected merchant content")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
  });
});
