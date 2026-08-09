import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "@/components/ui/input";

describe("Input", () => {
  it("associates its error with the input", () => {
    render(<Input label="Business name" error="Business name is required" />);

    const input = screen.getByRole("textbox", { name: "Business name" });
    const error = screen.getByText("Business name is required");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", error.id);
  });
});

