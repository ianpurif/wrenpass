"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CheckCircle2, Copy, ExternalLink, LoaderCircle, Rocket, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { Input } from "@/components/ui/input";
import { useReviewPrompt } from "@/components/reviews/review-prompt-provider";
import { useWallet } from "@/components/wallet/wallet-provider";
import { merchantApi } from "@/features/merchant/api";
import {
  campaignInputSchema,
  formatUsdcAmount,
  quoteCampaignFunding,
  toCampaignTerms,
  type CampaignInput,
} from "@/features/merchant/campaign-terms";
import {
  createAndPublishCampaign,
} from "@/features/merchant/campaign-workflow";
import { syncEventsAfterMutation } from "@/features/notifications/api";
import type { StellarConfig } from "@/lib/stellar/config";
import { StellarMetadataContractWriter } from "@/lib/stellar/metadata-client";
import { StellarCampaignPublisher } from "@/lib/stellar/publisher-client";
import { StellarCampaignContractWriter } from "@/lib/stellar/wrenpass-client";

function defaultExpiration(): string {
  const date = new Date(Date.now() + 90 * 86_400_000);
  date.setMinutes(0, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CampaignForm({
  config,
  onPublished,
}: {
  config: StellarConfig;
  onPublished(): Promise<void>;
}) {
  const { address, signTransaction } = useWallet();
  const { requestReview } = useReviewPrompt();
  const writer = useMemo(() => new StellarCampaignContractWriter(config), [config]);
  const metadataWriter = useMemo(
    () => new StellarMetadataContractWriter(config),
    [config],
  );
  const atomicPublisher = useMemo(
    () => config.publisherContractId ? new StellarCampaignPublisher(config) : undefined,
    [config],
  );
  const [image, setImage] = useState<File | null>(null);
  const submissionActiveRef = useRef(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishedCampaignId, setPublishedCampaignId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const copyResetRef = useRef<number | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    control,
  } = useForm<z.input<typeof campaignInputSchema>, unknown, CampaignInput>({
    resolver: zodResolver(campaignInputSchema),
    defaultValues: {
      name: "",
      serviceDescription: "",
      passPrice: "5",
      serviceValue: "6",
      maxSupply: 100,
      expiresAt: defaultExpiration(),
    },
  });

  const passPrice = useWatch({ control, name: "passPrice" });
  const serviceValue = useWatch({ control, name: "serviceValue" });
  const maxSupply = useWatch({ control, name: "maxSupply" });
  const numericMaxSupply = typeof maxSupply === "number" ? maxSupply : Number(maxSupply);
  let quote: ReturnType<typeof quoteCampaignFunding> | null = null;
  try {
    quote = quoteCampaignFunding({ passPrice, serviceValue, maxSupply: numericMaxSupply });
  } catch {
    quote = null;
  }

  useEffect(() => () => {
    if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
  }, []);

  const walletContext = address
    ? { merchant: address, signTransaction: (transactionXdr: string) => signTransaction(transactionXdr) }
    : null;

  const dependencies = {
    writer,
    atomicPublisher,
    saveMetadataReference: async (
      metadata: Parameters<typeof merchantApi.saveCampaignMetadata>[0],
    ) => {
      if (!metadata.imagePublicId) return;
      setStage("Finalizing campaign…");
      try {
        return await merchantApi.saveCampaignMetadata(metadata);
      } catch (metadataError) {
        console.warn("The campaign is live, but its image reference was not saved.", metadataError);
      }
    },
    saveMetadata: async (metadata: Parameters<typeof merchantApi.saveCampaignMetadata>[0]) => {
      if (walletContext) {
        setStage("Approve public campaign details in Freighter…");
        await metadataWriter.registerCampaignMetadata({
          campaignId: BigInt(metadata.campaignId),
          merchant: walletContext.merchant,
          metadata,
          signTransaction: walletContext.signTransaction,
        });
      }
      setStage("Verifying campaign metadata…");
      return merchantApi.saveCampaignMetadata(metadata);
    },
  };

  const submitCampaign = handleSubmit(async (values) => {
    if (!walletContext) return;
    setError(null);
    setPublishedCampaignId(null);
    setLinkCopied(false);
    try {
      setStage(image ? "Uploading campaign image…" : "Preparing on-chain campaign…");
      const uploaded = image ? await merchantApi.uploadImage("campaign-image", image) : null;
      setStage(
        atomicPublisher
          ? "Approve campaign creation in Freighter…"
          : "Approve the campaign draft in Freighter…",
      );
      const campaignId = await createAndPublishCampaign(
        {
          ...walletContext,
          terms: toCampaignTerms(values),
          metadata: {
            name: values.name,
            serviceDescription: values.serviceDescription,
            ...(uploaded
              ? {
                  imageUrl: uploaded.url,
                  imagePublicId: uploaded.publicId,
                  imageSha256: uploaded.sha256,
                }
              : {}),
          },
        },
        {
          ...dependencies,
          saveMetadata: async (metadata) => {
            setStage("Verifying descriptive campaign details…");
            const result = await dependencies.saveMetadata(metadata);
            setStage("Approve publishing in Freighter…");
            return result;
          },
        },
      );
      setPublishedCampaignId(campaignId);
      requestReview({ transactionLabel: "campaign publishing" });
      setImage(null);
      reset({
        name: "",
        serviceDescription: "",
        passPrice: "5",
        serviceValue: "6",
        maxSupply: 100,
        expiresAt: defaultExpiration(),
      });
      void syncEventsAfterMutation();
      await onPublished();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Campaign creation failed.");
    } finally {
      setStage(null);
    }
  });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    if (submissionActiveRef.current) {
      event.preventDefault();
      return;
    }
    submissionActiveRef.current = true;
    try {
      await submitCampaign(event);
    } finally {
      submissionActiveRef.current = false;
    }
  }

  async function copyCampaignLink() {
    if (!publishedCampaignId) return;
    try {
      await navigator.clipboard.writeText(
        new URL(`/campaigns/${publishedCampaignId}`, window.location.origin).toString(),
      );
      setLinkCopied(true);
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
      copyResetRef.current = window.setTimeout(() => setLinkCopied(false), 1_500);
    } catch {
      setError("The campaign is live, but its share link could not be copied.");
    }
  }

  return (
    <div>
      <form className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start" onSubmit={submit}>
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="campaign-details-heading">
            <h3 id="campaign-details-heading" className="text-sm font-bold text-ink">Campaign details</h3>
            <p className="mt-1 text-xs leading-5 text-ink-faint">The name and service description customers see before purchasing.</p>
            <div className="mt-5 grid gap-5">
              <Input label="Campaign name" placeholder="Five haircuts forward" error={errors.name?.message} {...register("name")} />
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-ink" htmlFor="service-description">Service description</label>
                <textarea
                  id="service-description"
                  rows={5}
                  className="rounded-lg border border-line bg-white px-3.5 py-3 text-sm leading-6 text-ink outline-none transition placeholder:text-ink-faint focus:border-forest focus:ring-3 focus:ring-forest/10"
                  placeholder="Describe the service customers can redeem, including any practical conditions."
                  aria-invalid={Boolean(errors.serviceDescription)}
                  {...register("serviceDescription")}
                />
                {errors.serviceDescription && <p className="text-sm text-danger">{errors.serviceDescription.message}</p>}
              </div>
            </div>
          </section>

          <section aria-labelledby="campaign-offer-heading" className="border-t border-line pt-8">
            <h3 id="campaign-offer-heading" className="text-sm font-bold text-ink">Offer and availability</h3>
            <p className="mt-1 text-xs leading-5 text-ink-faint">These financial terms are enforced by the contract.</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Input label="Price (USDC)" inputMode="decimal" error={errors.passPrice?.message} {...register("passPrice")} />
              <Input label="Service value (USDC)" inputMode="decimal" error={errors.serviceValue?.message} {...register("serviceValue")} />
              <Input label="Maximum passes" type="number" min="1" step="1" error={errors.maxSupply?.message} {...register("maxSupply", { valueAsNumber: true })} />
              <Input label="Expiration" type="datetime-local" error={errors.expiresAt?.message} {...register("expiresAt")} />
            </div>
          </section>

          <section aria-labelledby="campaign-image-heading" className="border-t border-line pt-8">
            <h3 id="campaign-image-heading" className="sr-only">Campaign image</h3>
            <ImageUploadField
              id="campaign-image"
              label="Campaign image"
              selectedFile={image}
              onFileChange={setImage}
            />
          </section>
        </div>

        <aside className="rounded-card border border-line bg-workspace p-5 xl:sticky xl:top-24">
          <h3 className="text-sm font-bold text-ink">Offer summary</h3>
          {quote ? (
            <>
              <p className="mt-4 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Per pass</p>
              <dl className="mt-2 divide-y divide-line border-y border-line">
                {[
                  ["Pay today", passPrice],
                  ["Service value", serviceValue],
                  ["Customer bonus", formatUsdcAmount(quote.perPass.bonus)],
                ].map(([label, amount]) => (
                  <div className="flex items-center justify-between gap-4 py-3" key={String(label)}>
                    <dt className="text-xs text-ink-muted">{String(label)}</dt>
                    <dd className="text-sm font-bold text-ink">{String(amount)} USDC</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-ink-faint">If all {numericMaxSupply} passes sell</p>
              <dl className="mt-2 divide-y divide-line border-y border-line">
                {[
                  ["Customer payments", quote.totals.customerPayments],
                  ["Available to you", quote.totals.merchantRelease],
                  ["Protected reserve", quote.totals.protectedReserve],
                  ["Platform fee", quote.totals.platformFee],
                ].map(([label, amount]) => (
                  <div className="flex items-center justify-between gap-4 py-3" key={String(label)}>
                    <dt className="text-xs text-ink-muted">{String(label)}</dt>
                    <dd className="text-sm font-bold text-ink">{formatUsdcAmount(amount as bigint)} USDC</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-ink-faint">Enter valid price and service values to calculate the distribution.</p>
          )}

          <div className="mt-5 flex gap-3 text-xs leading-5 text-ink-muted">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-forest" />
            <p>Financial terms become immutable once sales begin. Wallet approvals secure each on-chain step.</p>
          </div>
          {stage && <p role="status" className="mt-4 flex items-start gap-2 text-sm font-semibold text-forest"><LoaderCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin" />{stage}</p>}
          {error && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{error}</p>}
          {publishedCampaignId && (
            <div role="status" className="mt-4 border-y border-mint bg-mint-soft px-3 py-4">
              <p className="flex items-start gap-2 text-sm font-semibold text-forest">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                Campaign #{publishedCampaignId} is live on Stellar Testnet.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-forest/20 bg-white px-3 text-xs font-bold text-forest transition hover:border-forest/40"
                  href={`/campaigns/${publishedCampaignId}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  View campaign <ExternalLink aria-hidden="true" className="size-3.5" />
                </Link>
                <button
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-forest px-3 text-xs font-bold text-white transition hover:bg-forest-strong"
                  type="button"
                  onClick={() => void copyCampaignLink()}
                >
                  {linkCopied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
                  {linkCopied ? "Copied" : "Copy link"}
                </button>
              </div>
            </div>
          )}
          <Button className="mt-5 w-full" disabled={isSubmitting || Boolean(stage)} type="submit">
            {isSubmitting || stage ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Rocket aria-hidden="true" className="size-4" />}
            Create and publish campaign
          </Button>
        </aside>
      </form>
    </div>
  );
}
