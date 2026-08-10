"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, ImagePlus, LoaderCircle, Rocket, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/components/wallet/wallet-provider";
import { merchantApi } from "@/features/merchant/api";
import {
  campaignInputSchema,
  formatUsdcAmount,
  quoteCampaignInput,
  toCampaignTerms,
  type CampaignInput,
} from "@/features/merchant/campaign-terms";
import {
  createAndPublishCampaign,
  recoverableCampaignDraftSchema,
  resumeCampaignPublishing,
  type RecoverableCampaignDraft,
} from "@/features/merchant/campaign-workflow";
import { syncEventsAfterMutation } from "@/features/notifications/api";
import type { StellarConfig } from "@/lib/stellar/config";
import { StellarCampaignContractWriter } from "@/lib/stellar/wrenpass-client";

function defaultExpiration(): string {
  const date = new Date(Date.now() + 90 * 86_400_000);
  date.setMinutes(0, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function pendingKey(address: string): string {
  return `wrenpass:pending-campaign:${address}`;
}

function readPending(address: string): RecoverableCampaignDraft | null {
  try {
    const stored = window.localStorage.getItem(pendingKey(address));
    if (!stored) return null;
    return recoverableCampaignDraftSchema.parse(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function CampaignForm({
  config,
  onPublished,
}: {
  config: StellarConfig;
  onPublished(): Promise<void>;
}) {
  const { address, signTransaction } = useWallet();
  const writer = useMemo(() => new StellarCampaignContractWriter(config), [config]);
  const [image, setImage] = useState<File | null>(null);
  const [pending, setPending] = useState<RecoverableCampaignDraft | null>(() =>
    address ? readPending(address) : null,
  );
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
  let quote: ReturnType<typeof quoteCampaignInput> | null = null;
  try {
    quote = quoteCampaignInput({ passPrice, serviceValue });
  } catch {
    quote = null;
  }

  function rememberDraft(draft: RecoverableCampaignDraft) {
    if (!address) return;
    window.localStorage.setItem(pendingKey(address), JSON.stringify(draft));
    setPending(draft);
  }

  function clearDraft() {
    if (address) window.localStorage.removeItem(pendingKey(address));
    setPending(null);
  }

  const walletContext = address
    ? { merchant: address, signTransaction: (transactionXdr: string) => signTransaction(transactionXdr) }
    : null;

  const dependencies = {
    writer,
    saveMetadata: merchantApi.saveCampaignMetadata,
    onPending: rememberDraft,
    onComplete: clearDraft,
  };

  const submit = handleSubmit(async (values) => {
    if (!walletContext) return;
    setError(null);
    setSuccess(null);
    try {
      setStage(image ? "Uploading campaign image…" : "Preparing on-chain campaign…");
      const uploaded = image ? await merchantApi.uploadImage("campaign-image", image) : null;
      setStage("Approve the campaign draft in Freighter…");
      const campaignId = await createAndPublishCampaign(
        {
          ...walletContext,
          terms: toCampaignTerms(values),
          metadata: {
            name: values.name,
            serviceDescription: values.serviceDescription,
            ...(uploaded ? { imageUrl: uploaded.url, imagePublicId: uploaded.publicId } : {}),
          },
        },
        {
          ...dependencies,
          saveMetadata: async (metadata) => {
            setStage("Saving descriptive campaign details…");
            const result = await merchantApi.saveCampaignMetadata(metadata);
            setStage("Approve publishing in Freighter…");
            return result;
          },
          onPending: (draft) => {
            rememberDraft(draft);
          },
        },
      );
      setSuccess(`Campaign #${campaignId} is live on Stellar Testnet.`);
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

  async function resume() {
    if (!pending || !walletContext) return;
    setError(null);
    setSuccess(null);
    setStage("Restoring campaign metadata…");
    try {
      await resumeCampaignPublishing(pending, walletContext, {
        ...dependencies,
        saveMetadata: async (metadata) => {
          const result = await merchantApi.saveCampaignMetadata(metadata);
          setStage("Approve publishing in Freighter…");
          return result;
        },
      });
      setSuccess(`Campaign #${pending.campaignId} is live on Stellar Testnet.`);
      void syncEventsAfterMutation();
      await onPublished();
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "Unable to resume publishing.");
    } finally {
      setStage(null);
    }
  }

  return (
    <div>
      {pending && (
        <div className="mb-7 border-l-2 border-coral bg-coral-soft p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-coral-strong">Recoverable draft</p>
          <p className="mt-2 font-bold text-ink">Campaign #{pending.campaignId}: {pending.name}</p>
          <p className="mt-1 text-sm leading-6 text-ink-muted">The draft transaction is confirmed. Complete metadata registration and publishing without creating another campaign.</p>
          <Button className="mt-4" size="sm" disabled={Boolean(stage)} onClick={() => void resume()}>
            {stage ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Rocket aria-hidden="true" className="size-4" />}
            Resume publishing
          </Button>
        </div>
      )}

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
            <h3 id="campaign-image-heading" className="text-sm font-bold text-ink">Campaign image <span className="font-normal text-ink-faint">(optional)</span></h3>
            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-workspace px-4 py-4 text-sm font-semibold text-ink-muted transition hover:border-forest/40">
              <ImagePlus aria-hidden="true" className="size-4 text-forest" />
              <span className="min-w-0 truncate">{image?.name ?? "Choose JPG, PNG, or WebP up to 5 MB"}</span>
              <input id="campaign-image" aria-label="Campaign image" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
            </label>
          </section>
        </div>

        <aside className="rounded-xl border border-line bg-workspace p-5 xl:sticky xl:top-24">
          <h3 className="text-sm font-bold text-ink">Offer summary</h3>
          {quote ? (
            <dl className="mt-4 divide-y divide-line border-y border-line">
              {[
                ["Customer bonus", quote.bonus],
                ["Merchant receives", quote.merchantRelease],
                ["Protected reserve", quote.protectedReserve],
                ["Platform fee", quote.platformFee],
              ].map(([label, amount]) => (
                <div className="flex items-center justify-between gap-4 py-3" key={String(label)}>
                  <dt className="text-xs text-ink-muted">{String(label)}</dt>
                  <dd className="text-sm font-bold text-ink">{formatUsdcAmount(amount as bigint)} USDC</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm leading-6 text-ink-faint">Enter valid price and service values to calculate the distribution.</p>
          )}

          <div className="mt-5 flex gap-3 text-xs leading-5 text-ink-muted">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-forest" />
            <p>Financial terms become immutable once sales begin. Publishing requires two wallet approvals.</p>
          </div>
          {stage && <p role="status" className="mt-4 flex items-start gap-2 text-sm font-semibold text-forest"><LoaderCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin" />{stage}</p>}
          {error && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{error}</p>}
          {success && <p role="status" className="mt-4 flex items-start gap-2 text-sm font-semibold text-forest"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{success}</p>}
          <Button className="mt-5 w-full" disabled={isSubmitting || Boolean(stage) || Boolean(pending)} type="submit">
            {isSubmitting || stage ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Rocket aria-hidden="true" className="size-4" />}
            Create and publish campaign
          </Button>
        </aside>
      </form>
    </div>
  );
}
