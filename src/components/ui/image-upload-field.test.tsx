import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImageUploadField } from "@/components/ui/image-upload-field";

function TestField({ currentImageUrl }: { currentImageUrl?: string }) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <ImageUploadField
      currentImageUrl={currentImageUrl}
      id="test-image"
      label="Business logo"
      selectedFile={file}
      onFileChange={setFile}
    />
  );
}

describe("ImageUploadField", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:wrenpass-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("shows the current hosted image and filename", () => {
    render(
      <TestField currentImageUrl="https://res.cloudinary.com/wrenpass/image/upload/current-logo.png" />,
    );

    expect(screen.getByRole("img", { name: "Current image preview: current-logo.png" })).toBeInTheDocument();
    expect(screen.getByText("current-logo.png")).toBeInTheDocument();
  });

  it("previews a newly selected image with its original filename", async () => {
    const user = userEvent.setup();
    render(
      <TestField currentImageUrl="https://res.cloudinary.com/wrenpass/image/upload/current-logo.png" />,
    );
    const replacement = new File(["replacement"], "new-logo.webp", { type: "image/webp" });

    await user.upload(screen.getByLabelText("Business logo"), replacement);

    expect(await screen.findByRole("img", { name: "New image preview: new-logo.webp" })).toBeInTheDocument();
    expect(screen.getByText("new-logo.webp")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Current image preview: current-logo.png" })).toBeInTheDocument();
  });
});
