import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GiftPassDialog } from "@/components/customer/gift-pass-dialog";
import {
  testCustomerAddress,
  testCustomerPass,
  testRecipientAddress,
  testStellarConfig,
} from "@/test/fixtures/customer";

const mocks = vi.hoisted(() => ({ gift: vi.fn(), signTransaction: vi.fn() }));

vi.mock("@/components/wallet/wallet-provider", () => ({
  useWallet: () => ({ address: testCustomerAddress, signTransaction: mocks.signTransaction }),
}));
vi.mock("@/lib/stellar/wrenpass-client", () => ({
  StellarCustomerContractWriter: class {
    gift = mocks.gift;
  },
}));

describe("GiftPassDialog", () => {
  beforeEach(() => mocks.gift.mockReset().mockResolvedValue(undefined));

  it("rejects the current owner and gifts to a different valid address", async () => {
    const user = userEvent.setup();
    const onGifted = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <GiftPassDialog
        config={testStellarConfig}
        open
        pass={testCustomerPass}
        onGifted={onGifted}
        onOpenChange={onOpenChange}
      />,
    );

    const input = screen.getByLabelText("Recipient Stellar address");
    await user.type(input, testCustomerAddress);
    await user.click(screen.getByRole("button", { name: "Approve gift" }));
    expect(await screen.findByText("Choose a wallet other than the current owner.")).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, testRecipientAddress);
    await user.click(screen.getByRole("button", { name: "Approve gift" }));
    await waitFor(() => expect(mocks.gift).toHaveBeenCalledOnce());
    expect(mocks.gift).toHaveBeenCalledWith(
      expect.objectContaining({
        passId: BigInt(1),
        owner: testCustomerAddress,
        recipient: testRecipientAddress,
      }),
    );
    expect(onGifted).toHaveBeenCalledOnce();
  });
});
