import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RedemptionScanner } from "@/components/merchant/redemption-scanner";
import { encodeRedemptionQrPayload } from "@/features/redemption/qr";
import {
  testCustomerAddress as merchant,
  testRecipientAddress as owner,
  testStellarConfig,
} from "@/test/fixtures/customer";

const qrPayload = encodeRedemptionQrPayload({
  network: "testnet",
  contractId: testStellarConfig.wrenPassContractId,
  passId: "1",
});
const mocks = vi.hoisted(() => ({
  validate: vi.fn(),
  create: vi.fn(),
  prepare: vi.fn(),
  signAuthEntry: vi.fn(),
  scanImage: vi.fn(),
}));

vi.mock("@/components/wallet/wallet-provider", () => ({
  useWallet: () => ({ address: merchant, signAuthEntry: mocks.signAuthEntry }),
}));
vi.mock("@/features/redemption/api", () => ({
  redemptionApi: { validate: mocks.validate, create: mocks.create },
}));
vi.mock("@/lib/stellar/wrenpass-client", () => ({
  StellarRedemptionContractWriter: class {
    prepareMerchantAuthorization = mocks.prepare;
  },
}));
vi.mock("qr-scanner", () => ({
  default: class {
    static scanImage = mocks.scanImage;
  },
}));

describe("RedemptionScanner", () => {
  it("validates the QR, obtains merchant auth, and creates an owner request", async () => {
    mocks.scanImage.mockResolvedValue({ data: qrPayload });
    mocks.validate.mockResolvedValue({
      passId: "1",
      campaignId: "1",
      merchant,
      owner,
      expiresAt: "2026-11-08T03:00:00.000Z",
    });
    mocks.prepare.mockResolvedValue({
      serializedTransaction: "merchant-authorized-transaction",
      expiresAtLedger: 1_234_567,
    });
    mocks.create.mockResolvedValue({ id: "1" });
    const user = userEvent.setup();

    render(<RedemptionScanner config={testStellarConfig} />);
    await user.upload(
      screen.getByLabelText("Use QR image"),
      new File(["qr"], "pass.png", { type: "image/png" }),
    );

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      qrPayload,
      serializedTransaction: "merchant-authorized-transaction",
      expiresAtLedger: 1_234_567,
    }));
    expect(mocks.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ passId: BigInt(1), merchant, owner, signAuthEntry: expect.any(Function) }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Pass #1 is waiting");
  });
});
