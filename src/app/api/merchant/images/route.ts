import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createCloudinaryImageService,
  type CloudinaryFolder,
} from "@/server/cloudinary/image-service";
import { getRequestWalletAddress } from "@/server/wallet-auth/request-session";

const MAX_IMAGE_BYTES = 5 * 1_024 * 1_024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const uploadKindSchema = z.enum(["merchant-logo", "campaign-image"]);

export const runtime = "nodejs";

function folderFor(kind: z.infer<typeof uploadKindSchema>): CloudinaryFolder {
  return kind === "merchant-logo" ? "wrenpass/merchant-logos" : "wrenpass/campaign-images";
}

export async function POST(request: NextRequest) {
  const walletAddress = await getRequestWalletAddress(request);
  if (!walletAddress) return Response.json({ error: "Connect your wallet first." }, { status: 401 });

  try {
    const form = await request.formData();
    const kind = uploadKindSchema.parse(form.get("kind"));
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "Choose an image to upload." }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES || !allowedTypes.has(file.type)) {
      return Response.json(
        { error: "Use a JPG, PNG, or WebP image no larger than 5 MB." },
        { status: 400 },
      );
    }

    const uploaded = await createCloudinaryImageService().uploadImage({
      source: file,
      folder: folderFor(kind),
    });
    return Response.json(
      { url: uploaded.secureUrl, publicId: uploaded.publicId },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Choose a supported image destination." }, { status: 400 });
    }
    return Response.json({ error: "Unable to upload the image." }, { status: 503 });
  }
}
