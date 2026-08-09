import "server-only";

import { v2 as cloudinary } from "cloudinary";
import { z } from "zod";

import { getServerEnv } from "@/server/env";

export type CloudinaryFolder =
  | "wrenpass/merchant-logos"
  | "wrenpass/campaign-images"
  | "wrenpass/smoke-tests";

export interface CloudinaryUploader {
  upload(
    source: string | Blob,
    options: {
      folder: CloudinaryFolder;
      overwrite: false;
      public_id?: string;
      resource_type: "image";
    },
  ): Promise<{
    public_id: string;
    secure_url: string;
    width: number;
    height: number;
  }>;
  destroy(
    publicId: string,
    options: { invalidate: true; resource_type: "image" },
  ): Promise<{ result: string }>;
}

export interface UploadedImage {
  publicId: string;
  secureUrl: string;
  width: number;
  height: number;
}

const publicIdSchema = z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);

interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

type SignatureParameters = Record<string, boolean | number | string>;
type CloudinarySigner = (parameters: SignatureParameters, apiSecret: string) => string;
type CloudinaryDestroyer = (
  publicId: string,
  options: { invalidate: true; resource_type: "image" },
) => Promise<{ result: string }>;

function isUploadResponse(value: unknown): value is {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as Record<string, unknown>;
  return (
    typeof response.public_id === "string" &&
    typeof response.secure_url === "string" &&
    typeof response.width === "number" &&
    typeof response.height === "number"
  );
}

function getCloudinaryErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const error = (value as Record<string, unknown>).error;
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" ? message : undefined;
}

export class SignedCloudinaryUploader implements CloudinaryUploader {
  constructor(
    private readonly credentials: CloudinaryCredentials,
    private readonly signer: CloudinarySigner,
    private readonly destroyer: CloudinaryDestroyer,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async upload(
    source: string | Blob,
    options: {
      folder: CloudinaryFolder;
      overwrite: false;
      public_id?: string;
      resource_type: "image";
    },
  ): Promise<{
    public_id: string;
    secure_url: string;
    width: number;
    height: number;
  }> {
    const timestamp = Math.floor(Date.now() / 1_000);
    const signatureParameters: SignatureParameters = {
      folder: options.folder,
      overwrite: options.overwrite,
      timestamp,
    };

    if (options.public_id) {
      signatureParameters.public_id = options.public_id;
    }

    const form = new FormData();
    if (source instanceof Blob) {
      form.append("file", source, "upload");
    } else {
      form.append("file", source);
    }
    form.append("api_key", this.credentials.apiKey);
    form.append("timestamp", String(timestamp));
    form.append("signature", this.signer(signatureParameters, this.credentials.apiSecret));
    form.append("folder", options.folder);
    form.append("overwrite", String(options.overwrite));

    if (options.public_id) {
      form.append("public_id", options.public_id);
    }

    const response = await this.fetcher(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.credentials.cloudName)}/image/upload`,
      {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(60_000),
      },
    );
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const providerMessage = getCloudinaryErrorMessage(payload);
      throw new Error(
        providerMessage
          ? `Cloudinary upload failed: ${providerMessage}`
          : `Cloudinary upload failed with status ${response.status}`,
      );
    }

    if (!isUploadResponse(payload)) {
      throw new Error("Cloudinary returned an invalid upload response");
    }

    return payload;
  }

  destroy(
    publicId: string,
    options: { invalidate: true; resource_type: "image" },
  ): Promise<{ result: string }> {
    return this.destroyer(publicId, options);
  }
}

export class CloudinaryImageService {
  constructor(private readonly uploader: CloudinaryUploader) {}

  async uploadImage(input: {
    source: string | Blob;
    folder: CloudinaryFolder;
    publicId?: string;
  }): Promise<UploadedImage> {
    const publicId = input.publicId ? publicIdSchema.parse(input.publicId) : undefined;
    const result = await this.uploader.upload(input.source, {
      folder: input.folder,
      overwrite: false,
      public_id: publicId,
      resource_type: "image",
    });

    return {
      publicId: result.public_id,
      secureUrl: result.secure_url,
      width: result.width,
      height: result.height,
    };
  }

  async deleteImage(publicId: string): Promise<void> {
    const result = await this.uploader.destroy(publicId, {
      invalidate: true,
      resource_type: "image",
    });

    if (result.result !== "ok" && result.result !== "not found") {
      throw new Error("Cloudinary did not confirm image deletion");
    }
  }
}

export function createCloudinaryImageService(): CloudinaryImageService {
  const env = getServerEnv();

  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  const uploader = new SignedCloudinaryUploader(
    {
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
    },
    cloudinary.utils.api_sign_request,
    (publicId, options) => cloudinary.uploader.destroy(publicId, options),
  );

  return new CloudinaryImageService(uploader);
}
