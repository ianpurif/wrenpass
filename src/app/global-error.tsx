"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-workspace p-6 text-ink">
        <main className="w-full max-w-lg border border-line bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-coral">WrenPass</p>
          <h1 className="mt-3 text-2xl font-bold">Something went wrong</h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            The error was recorded. Your confirmed Stellar transactions are unaffected.
          </p>
          <Button className="mt-6" onClick={reset}>Try again</Button>
        </main>
      </body>
    </html>
  );
}
