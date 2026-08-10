import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PassQrDialog } from "@/components/customer/pass-qr-dialog";
import { testStellarConfig } from "@/test/fixtures/customer";

describe("PassQrDialog", () => {
  it("labels the QR as pass identity rather than redemption authority", () => {
    render(
      <PassQrDialog
        config={testStellarConfig}
        open
        passId="1"
        onOpenChange={vi.fn()}
      />,
    );

    const qr = screen.getByLabelText("Redemption QR for WrenPass 1");

    expect(qr).toBeInTheDocument();
    expect(qr.querySelector("image")).toHaveAttribute("href", "/logo-qr.svg");
    expect(screen.getByText("This QR is not a bearer credential.")).toBeInTheDocument();
    expect(screen.getByText(/You must then approve and submit/)).toBeInTheDocument();
  });
});
