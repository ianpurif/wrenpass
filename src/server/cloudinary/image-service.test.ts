import { describe, expect, it, vi } from "vitest";

import {
  CloudinaryImageService,
  SignedCloudinaryUploader,
  type CloudinaryUploader,
} from "@/server/cloudinary/image-service";

function createUploader(): CloudinaryUploader {
  return {
    upload: vi.fn(async () => ({
      public_id: "wrenpass/campaign-images/image-1",
      secure_url: "https://res.cloudinary.com/wrenpass/image/upload/image-1.png",
      width: 800,
      height: 600,
    })),
    destroy: vi.fn(async () => ({ result: "ok" })),
  };
}

describe("CloudinaryImageService", () => {
  it("uses an authenticated image-only upload boundary", async () => {
    const uploader = createUploader();
    const service = new CloudinaryImageService(uploader);

    await expect(
      service.uploadImage({
        source: "data:image/png;base64,image-data",
        folder: "wrenpass/campaign-images",
      }),
    ).resolves.toEqual({
      publicId: "wrenpass/campaign-images/image-1",
      secureUrl: "https://res.cloudinary.com/wrenpass/image/upload/image-1.png",
      width: 800,
      height: 600,
    });

    expect(uploader.upload).toHaveBeenCalledWith(
      "data:image/png;base64,image-data",
      expect.objectContaining({ resource_type: "image", overwrite: false }),
    );
  });

  it("surfaces upload failures", async () => {
    const uploader = createUploader();
    vi.mocked(uploader.upload).mockRejectedValueOnce(new Error("upload failed"));

    const service = new CloudinaryImageService(uploader);
    await expect(
      service.uploadImage({
        source: "invalid",
        folder: "wrenpass/merchant-logos",
      }),
    ).rejects.toThrow("upload failed");
  });

  it("rejects public IDs that can escape the configured folder", async () => {
    const uploader = createUploader();
    const service = new CloudinaryImageService(uploader);

    await expect(
      service.uploadImage({
        source: "invalid",
        folder: "wrenpass/merchant-logos",
        publicId: "another-folder/image",
      }),
    ).rejects.toThrow();
    expect(uploader.upload).not.toHaveBeenCalled();
  });
});

describe("SignedCloudinaryUploader", () => {
  it("signs server-side and validates the upload response", async () => {
    const signer = vi.fn(() => "signed-request");
    const destroyer = vi.fn(async () => ({ result: "ok" }));
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          public_id: "wrenpass/smoke-tests/image-1",
          secure_url: "https://res.cloudinary.com/wrenpass/image/upload/image-1.png",
          width: 1,
          height: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const uploader = new SignedCloudinaryUploader(
      { cloudName: "wrenpass", apiKey: "api-key", apiSecret: "api-secret" },
      signer,
      destroyer,
      fetcher,
    );

    await expect(
      uploader.upload("data:image/png;base64,image-data", {
        folder: "wrenpass/smoke-tests",
        overwrite: false,
        resource_type: "image",
      }),
    ).resolves.toEqual(
      expect.objectContaining({ public_id: "wrenpass/smoke-tests/image-1" }),
    );
    expect(signer).toHaveBeenCalledWith(
      expect.objectContaining({ folder: "wrenpass/smoke-tests", overwrite: false }),
      "api-secret",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.cloudinary.com/v1_1/wrenpass/image/upload",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
