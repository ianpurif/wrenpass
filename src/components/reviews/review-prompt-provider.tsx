"use client";

import { CheckCircle2, ExternalLink, LoaderCircle, Sparkles, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { Button, buttonStyles } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useWallet } from "@/components/wallet/wallet-provider";
import { shortenStellarAddress } from "@/features/merchant/display";
import {
  REVIEW_MESSAGE_MAX_CHARACTERS,
  reviewInputSchema,
} from "@/features/reviews/validation";
import type { StellarConfig } from "@/lib/stellar/config";
import { stellarTransactionUrl } from "@/lib/stellar/explorer";
import { StellarReviewContractWriter } from "@/lib/stellar/reviews-client";

interface ReviewPromptRequest {
  transactionLabel: string;
}

interface ActiveReviewPromptRequest extends ReviewPromptRequest {
  promptId: number;
}

interface ReviewPromptContextValue {
  requestReview(input: ReviewPromptRequest): void;
}

const ReviewPromptContext = createContext<ReviewPromptContextValue>({
  requestReview: () => undefined,
});

export function useReviewPrompt(): ReviewPromptContextValue {
  return useContext(ReviewPromptContext);
}

export function ReviewPromptProvider({
  children,
  config,
}: {
  children: ReactNode;
  config: StellarConfig;
}) {
  const nextPromptId = useRef(0);
  const [request, setRequest] = useState<ActiveReviewPromptRequest | null>(null);
  const requestReview = useCallback((input: ReviewPromptRequest) => {
    nextPromptId.current += 1;
    setRequest({ ...input, promptId: nextPromptId.current });
  }, []);

  return (
    <ReviewPromptContext.Provider value={{ requestReview }}>
      {children}
      {request && (
        <ReviewPrompt
          key={request.promptId}
          config={config}
          open
          transactionLabel={request.transactionLabel}
          onOpenChange={(open) => {
            if (!open) setRequest(null);
          }}
        />
      )}
    </ReviewPromptContext.Provider>
  );
}

function ReviewPrompt({
  config,
  open,
  transactionLabel,
  onOpenChange,
}: {
  config: StellarConfig;
  open: boolean;
  transactionLabel: string;
  onOpenChange(open: boolean): void;
}) {
  const router = useRouter();
  const { address, signAuthEntry } = useWallet();
  const writer = useMemo(() => new StellarReviewContractWriter(config), [config]);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  const handleDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!submitting) onOpenChange(nextOpen);
  }, [onOpenChange, submitting]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) {
      setError("Reconnect the wallet that completed the transaction to publish a review.");
      return;
    }

    const parsed = reviewInputSchema.safeParse({ rating, message });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your review and try again.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const receipt = await writer.submit({
        reviewer: address,
        ...parsed.data,
        signAuthEntry: (authorizationXdr) => signAuthEntry(authorizationXdr),
      });
      setReviewId(receipt.reviewId);
      setTransactionHash(receipt.transactionHash);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The review could not be published.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      description={reviewId
        ? "Your wallet-authorized review is now part of the public WrenPass review ledger."
        : `Your ${transactionLabel} succeeded. Share a short public review tied to your wallet.`}
      open={open}
      title={reviewId ? "Review published" : "How was your experience?"}
      onOpenChange={handleDialogOpenChange}
    >
      {reviewId ? (
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-mint-soft text-forest">
            <CheckCircle2 aria-hidden="true" className="size-8" />
          </div>
          <p className="mt-5 text-lg font-bold text-ink">Thank you for helping others decide.</p>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Review #{reviewId} is stored on Stellar and will appear in the public review feed.</p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Done</Button>
            {transactionHash && (
              <a
                className={buttonStyles()}
                href={stellarTransactionUrl(config.network, transactionHash)}
                rel="noreferrer noopener"
                target="_blank"
              >
                View on-chain <ExternalLink aria-hidden="true" className="size-4" />
              </a>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="rounded-2xl border border-line bg-workspace p-4">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-ink-faint">Publishing as</p>
            <p className="mt-1 font-mono text-sm font-semibold text-ink" title={address ?? undefined}>
              {address ? shortenStellarAddress(address) : "Wallet disconnected"}
            </p>
            <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-forest">
              <Sparkles aria-hidden="true" className="size-3.5" />
              WrenPass pays the Stellar network fee
            </p>
          </div>

          <fieldset className="mt-6">
            <legend className="text-sm font-bold text-ink">Your rating</legend>
            <div
              className="mt-3 flex w-fit gap-1"
              onMouseLeave={() => setHoveredRating(0)}
            >
              {[1, 2, 3, 4, 5].map((value) => {
                const active = value <= (hoveredRating || rating);
                return (
                  <button
                    key={value}
                    aria-label={`${value} star${value === 1 ? "" : "s"}`}
                    aria-pressed={rating === value}
                    className="grid size-11 place-items-center rounded-xl text-coral transition hover:-translate-y-0.5 hover:bg-coral-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                    disabled={submitting}
                    type="button"
                    onClick={() => setRating(value)}
                    onFocus={() => setHoveredRating(value)}
                    onBlur={() => setHoveredRating(0)}
                    onMouseEnter={() => setHoveredRating(value)}
                  >
                    <Star aria-hidden="true" className="size-7" fill={active ? "currentColor" : "none"} strokeWidth={1.8} />
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm font-bold text-ink" htmlFor="review-message">Review message</label>
              <span className="text-xs tabular-nums text-ink-faint">{message.length}/{REVIEW_MESSAGE_MAX_CHARACTERS}</span>
            </div>
            <textarea
              id="review-message"
              className="mt-2 min-h-32 w-full resize-y rounded-xl border border-line bg-white px-4 py-3 text-sm leading-6 text-ink outline-none transition placeholder:text-ink-faint focus:border-forest focus:ring-3 focus:ring-forest/10"
              disabled={submitting}
              maxLength={REVIEW_MESSAGE_MAX_CHARACTERS}
              placeholder="What felt clear, useful, or worth improving?"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <p className="mt-2 text-xs leading-5 text-ink-faint">Reviews are public and permanent once submitted on-chain.</p>
          </div>

          {error && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{error}</p>}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button disabled={submitting} type="button" variant="secondary" onClick={() => onOpenChange(false)}>Not now</Button>
            <Button disabled={submitting} type="submit">
              {submitting && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              Publish review
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
