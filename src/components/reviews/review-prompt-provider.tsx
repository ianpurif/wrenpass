"use client";

import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { StellarConfig } from "@/lib/stellar/config";
import { captureTransactionSucceeded } from "@/lib/analytics";

const ReviewPrompt = lazy(() =>
  import("@/components/reviews/review-prompt").then((module) => ({
    default: module.ReviewPrompt,
  })),
);

interface ReviewPromptRequest {
  transactionLabel: string;
  promptTitle?: string;
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
    captureTransactionSucceeded(input.transactionLabel);
    nextPromptId.current += 1;
    setRequest({ ...input, promptId: nextPromptId.current });
  }, []);

  return (
    <ReviewPromptContext.Provider value={{ requestReview }}>
      {children}
      {request && (
        <Suspense fallback={null}>
          <ReviewPrompt
            key={request.promptId}
            config={config}
            open
            promptTitle={request.promptTitle}
            transactionLabel={request.transactionLabel}
            onOpenChange={(open) => {
              if (!open) setRequest(null);
            }}
          />
        </Suspense>
      )}
    </ReviewPromptContext.Provider>
  );
}
