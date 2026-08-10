import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Logo } from "@/components/layout/logo";

describe("Logo", () => {
  it("renders the shared app logo asset with an accessible name", () => {
    render(<Logo />);

    const logo = screen.getByRole("img", { name: "WrenPass" });

    expect(logo).toHaveStyle({ backgroundImage: 'url("/logo.png")' });
  });
});
