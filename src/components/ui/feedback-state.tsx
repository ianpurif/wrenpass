import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface LoadingStateProps {
  label?: string;
  className?: string;
}

export function LoadingState({ label = "Loading", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      className={cn("flex items-center justify-center gap-2 text-sm text-ink-muted", className)}
    >
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

interface ErrorStateProps {
  actionLabel?: string;
  description: string;
  onRetry?: () => void;
  title?: string;
  children?: ReactNode;
}

export function ErrorState({
  actionLabel = "Try again",
  description,
  onRetry,
  title = "Something went wrong",
  children,
}: ErrorStateProps) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/20 bg-danger-soft p-5">
      <div className="flex gap-3">
        <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
        <div>
          <h3 className="font-bold text-ink">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-muted">{description}</p>
          {children}
          {onRetry && (
            <Button className="mt-4" size="sm" variant="secondary" onClick={onRetry}>
              <RotateCcw aria-hidden="true" className="size-4" />
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

