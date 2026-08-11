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
    const logo = qr.querySelector("image");

    expect(qr).toBeInTheDocument();
    expect(logo).toHaveAttribute("href", "/logo-qr.png");
    expect(Number(logo?.getAttribute("width"))).toBeGreaterThan(0);
    expect(Number(logo?.getAttribute("height"))).toBeGreaterThan(0);
    expect(Number(logo?.getAttribute("width")) / Number(logo?.getAttribute("height"))).toBeCloseTo(84 / 58, 2);
    expect(screen.getByText("This QR is not a bearer credential.")).toBeInTheDocument();
    expect(screen.getByText(/You must then approve and submit/)).toBeInTheDocument();
  });
});
