"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, LoaderCircle, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { merchantApi } from "@/features/merchant/api";
import { useWallet } from "@/components/wallet/wallet-provider";
import {
  merchantProfileInputSchema,
  type MerchantProfileInput,
} from "@/features/merchant/campaign-terms";
import type { Merchant } from "@/server/models";
import type { StellarConfig } from "@/lib/stellar/config";
import { StellarMetadataContractWriter } from "@/lib/stellar/metadata-client";

export function MerchantProfileForm({
  merchant,
  config,
  onSaved,
}: {
  merchant: Merchant | null;
  config: StellarConfig;
  onSaved(merchant: Merchant): void;
}) {
  const { address, signTransaction } = useWallet();
  const metadataWriter = useMemo(
    () => new StellarMetadataContractWriter(config),
    [config],
  );
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<MerchantProfileInput>({
    resolver: zodResolver(merchantProfileInputSchema),
    defaultValues: {
      businessName: merchant?.businessName ?? "",
      description: merchant?.description ?? "",
    },
  });

  useEffect(() => {
    reset({
      businessName: merchant?.businessName ?? "",
      description: merchant?.description ?? "",
    });
  }, [merchant, reset]);

  const submit = handleSubmit(async (values) => {
    setError(null);
    setSaved(false);
    try {
      const uploaded = logo ? await merchantApi.uploadImage("merchant-logo", logo) : null;
      const profile = {
        ...values,
        ...(uploaded
          ? {
              logoUrl: uploaded.url,
              logoPublicId: uploaded.publicId,
              logoSha256: uploaded.sha256,
            }
          : {}),
      };
      if (!address) throw new Error("Connect your merchant wallet first.");
      await metadataWriter.setMerchantProfile({
        merchant: address,
        profile: {
          ...values,
          logoUrl: uploaded?.url ?? merchant?.logoUrl,
          logoSha256: uploaded?.sha256 ?? merchant?.logoSha256,
        },
        signTransaction: (transactionXdr) => signTransaction(transactionXdr),
      });
      const nextMerchant = await merchantApi.saveProfile(profile);
      setLogo(null);
      setSaved(true);
      onSaved(nextMerchant);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save the profile.");
    }
  });

  return (
    <form className="grid gap-6" onSubmit={submit}>
      <Input
        label="Business name"
        placeholder="Wren & Willow Studio"
        error={errors.businessName?.message}
        {...register("businessName")}
      />
      <div className="grid gap-2">
        <label className="text-sm font-semibold text-ink" htmlFor="merchant-description">
          Business description
        </label>
        <textarea
          id="merchant-description"
          rows={5}
          className="rounded-lg border border-line bg-white px-3.5 py-3 text-sm leading-6 text-ink outline-none transition placeholder:text-ink-faint focus:border-forest focus:ring-3 focus:ring-forest/10"
          placeholder="Tell customers what your business does and where the service is delivered."
          aria-invalid={Boolean(errors.description)}
          {...register("description")}
        />
        {errors.description && <p className="text-sm text-danger">{errors.description.message}</p>}
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-semibold text-ink" htmlFor="merchant-logo">
          Business logo <span className="font-normal text-ink-faint">(optional)</span>
        </label>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-workspace px-4 py-4 text-sm font-semibold text-ink-muted transition hover:border-forest/40">
          <ImagePlus aria-hidden="true" className="size-4 text-forest" />
          <span>{logo?.name ?? (merchant?.logoUrl ? "Replace current logo" : "Choose JPG, PNG, or WebP")}</span>
          <input
            id="merchant-logo"
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setLogo(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
      {saved && <p role="status" className="text-sm font-semibold text-forest">Profile saved.</p>}
      <Button className="w-full sm:w-fit" disabled={isSubmitting} type="submit">
        {isSubmitting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" />}
        {merchant ? "Update profile" : "Save merchant profile"}
      </Button>
    </form>
  );
}
