"use client";

import { ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function fileNameFromUrl(imageUrl: string): string {
  try {
    const segments = new URL(imageUrl, "https://wrenpass.invalid").pathname.split("/");
    return decodeURIComponent(segments.at(-1) || "Current image");
  } catch {
    return "Current image";
  }
}

function ImagePreview({
  fileName,
  imageUrl,
  label,
}: {
  fileName: string;
  imageUrl: string;
  label: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-card border border-line bg-white">
      <div
        aria-label={`${label} preview: ${fileName}`}
        className="aspect-[16/9] bg-sage-soft bg-contain bg-center bg-no-repeat"
        role="img"
        style={{ backgroundImage: `url(${imageUrl})` }}
      />
      <div className="border-t border-line px-3 py-2.5">
        <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-ink-faint">
          {label}
        </p>
        <p className="mt-1 truncate text-xs font-semibold text-ink" title={fileName}>
          {fileName}
        </p>
      </div>
    </div>
  );
}

export function ImageUploadField({
  currentImageUrl,
  helperText = "JPG, PNG, or WebP up to 5 MB",
  id,
  label,
  optional = true,
  selectedFile,
  onFileChange,
}: {
  currentImageUrl?: string;
  helperText?: string;
  id: string;
  label: string;
  optional?: boolean;
  selectedFile: File | null;
  onFileChange(file: File | null): void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [localPreview, setLocalPreview] = useState<{ file: File; url: string } | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [selectedFile]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  function selectFile(file: File | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = file ? URL.createObjectURL(file) : null;
    previewUrlRef.current = url;
    setLocalPreview(file && url ? { file, url } : null);
    onFileChange(file);
  }

  const selectedPreviewUrl = localPreview?.file === selectedFile ? localPreview.url : null;

  const hasPreview = Boolean(currentImageUrl || selectedPreviewUrl);
  const actionLabel = selectedFile
    ? "Choose a different image"
    : currentImageUrl
      ? "Choose replacement image"
      : "Choose image";

  return (
    <div className="grid gap-3">
      <label className="text-sm font-semibold text-ink" htmlFor={id}>
        {label}{" "}
        {optional && <span className="font-normal text-ink-faint">(optional)</span>}
      </label>

      {hasPreview && (
        <div className="grid gap-3 sm:grid-cols-2">
          {currentImageUrl && (
            <ImagePreview
              fileName={fileNameFromUrl(currentImageUrl)}
              imageUrl={currentImageUrl}
              label="Current image"
            />
          )}
          {selectedFile && selectedPreviewUrl && (
            <ImagePreview
              fileName={selectedFile.name}
              imageUrl={selectedPreviewUrl}
              label="New image"
            />
          )}
        </div>
      )}

      <label
        className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-workspace px-4 py-4 text-ink-muted transition hover:border-forest/40"
        htmlFor={id}
      >
        <ImagePlus aria-hidden="true" className="size-4 shrink-0 text-forest" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{actionLabel}</span>
          <span className="mt-0.5 block text-xs font-normal text-ink-faint">{helperText}</span>
        </span>
        <input
          ref={inputRef}
          accept="image/jpeg,image/png,image/webp"
          aria-label={label}
          className="sr-only"
          id={id}
          type="file"
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}
