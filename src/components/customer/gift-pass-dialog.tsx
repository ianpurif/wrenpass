"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Gift, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useReviewPrompt } from "@/components/reviews/review-prompt-provider";
import { useWallet } from "@/components/wallet/wallet-provider";
import type { CustomerPassDto } from "@/features/customer/dto";
import {
  giftRecipientSchema,
  type GiftRecipientInput,
} from "@/features/customer/validation";
import { syncEventsAfterMutation } from "@/features/notifications/api";
import type { StellarConfig } from "@/lib/stellar/config";
import { StellarCustomerContractWriter } from "@/lib/stellar/wrenpass-client";

export function GiftPassDialog({
  config,
  open,
  pass,
  onGifted,
  onOpenChange,
}: {
  config: StellarConfig;
  open: boolean;
  pass: CustomerPassDto;
  onGifted(): Promise<void>;
  onOpenChange(open: boolean): void;
}) {
  const { address, signTransaction } = useWallet();
  const { requestReview } = useReviewPrompt();
  const writer = useMemo(() => new StellarCustomerContractWriter(config), [config]);
  const [error, setError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError: setFieldError,
  } = useForm<GiftRecipientInput>({
    resolver: zodResolver(giftRecipientSchema),
    defaultValues: { recipient: "" },
  });

  const submit = handleSubmit(async ({ recipient }) => {
    if (!address) return;
    if (recipient === address) {
      setFieldError("recipient", { message: "Choose a wallet other than the current owner." });
      return;
    }

    setError(null);
    try {
      await writer.gift({
        passId: BigInt(pass.id),
        owner: address,
        recipient,
        signTransaction: (transactionXdr: string) => signTransaction(transactionXdr),
      });
      requestReview({ transactionLabel: "pass gift" });
      void syncEventsAfterMutation();
      reset();
      onOpenChange(false);
      await onGifted();
    } catch (giftError) {
      setError(giftError instanceof Error ? giftError.message : "The pass could not be gifted.");
    }
  });

  return (
    <Dialog
      description="Gifting changes the owner of this pass. It does not create a copy, and only the recipient can use or gift it afterward."
      open={open}
      title={`Gift pass #${pass.id}`}
      onOpenChange={(nextOpen) => !isSubmitting && onOpenChange(nextOpen)}
    >
      <form className="grid gap-5" onSubmit={submit}>
        <Input
          label="Recipient Stellar address"
          placeholder="G…"
          autoComplete="off"
          error={errors.recipient?.message}
          helperText="The recipient does not need to approve the gift. Check every character."
          {...register("recipient")}
        />
        <div className="rounded-2xl border border-coral/25 bg-coral-soft p-4 text-sm leading-6 text-ink-muted">
          This wallet approval transfers ownership immediately on Stellar Testnet and cannot be undone by WrenPass.
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={isSubmitting} variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Gift aria-hidden="true" className="size-4" />}
            Approve gift
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
