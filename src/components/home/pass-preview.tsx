import { ArrowUpRight, CheckCircle2, Scissors } from "lucide-react";

import { Card } from "@/components/ui/card";

export function PassPreview() {
  return (
    <Card className="relative overflow-hidden p-5 sm:p-6" aria-label="Sample WrenPass campaign">
      <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-full bg-coral-soft" aria-hidden="true" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-coral-soft text-coral-strong">
              <Scissors aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Sample campaign</p>
              <h2 className="mt-1 font-bold text-ink">Northline Studio</h2>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-mint-soft px-2.5 py-1 text-xs font-bold text-forest">
            <CheckCircle2 aria-hidden="true" className="size-3.5" />
            Active
          </span>
        </div>

        <div className="mt-7 rounded-2xl bg-ink p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-white/60">Studio supporter pass</p>
          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-white/65">Pay today</p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight">5 USDC</p>
            </div>
            <ArrowUpRight aria-hidden="true" className="size-6 text-mint" />
          </div>
          <div className="my-5 h-px bg-white/12" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/65">Service value</span>
            <span className="font-bold">6 USDC</span>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-ink">64 of 100 supported</span>
            <span className="text-ink-muted">36 remaining</span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-sage-soft">
            <div className="h-full w-[64%] rounded-full bg-coral" />
          </div>
        </div>
      </div>
    </Card>
  );
}

