import { Check, Scissors } from "lucide-react";

export function PassPreview() {
  return (
    <article
      aria-label="Sample WrenPass campaign"
      className="relative overflow-hidden rounded-[3px] border border-ink/15 bg-[#f3efe4] text-ink shadow-[0_34px_90px_rgba(23,36,31,0.18)]"
    >
      <div className="flex items-center justify-between border-b border-ink/15 px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          <Scissors aria-hidden="true" className="size-4 text-coral-strong" strokeWidth={1.7} />
          <p className="text-[0.64rem] font-extrabold uppercase tracking-[0.2em] text-ink-muted">
            Northline Studio
          </p>
        </div>
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-ink-faint">WP / 000064</p>
      </div>

      <div className="grid sm:grid-cols-[1fr_9rem]">
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-forest">
            <Check aria-hidden="true" className="size-3.5" />
            Active campaign
          </div>
          <h3 className="landing-display mt-5 max-w-[8ch] text-4xl leading-[0.92] tracking-[-0.055em] sm:text-5xl">
            Studio supporter pass
          </h3>

          <div className="mt-10 grid grid-cols-2 border-y border-ink/15 py-5">
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-ink-faint">Pay today</p>
              <p className="mt-2 text-2xl font-extrabold tracking-[-0.035em]">5 USDC</p>
            </div>
            <div className="border-l border-ink/15 pl-5">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-ink-faint">Service value</p>
              <p className="mt-2 text-2xl font-extrabold tracking-[-0.035em]">6 USDC</p>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold">64 supported</span>
              <span className="text-ink-muted">36 remaining</span>
            </div>
            <div className="mt-3 h-1 bg-ink/10">
              <div className="h-full w-[64%] bg-coral" />
            </div>
          </div>
        </div>

        <div className="relative flex border-t border-dashed border-ink/25 p-6 sm:border-l sm:border-t-0 sm:p-5">
          <span
            aria-hidden="true"
            className="absolute -left-3 -top-3 hidden size-6 rounded-full border-b border-ink/15 bg-canvas sm:block"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-3 -left-3 hidden size-6 rounded-full border-t border-ink/15 bg-canvas sm:block"
          />
          <div className="flex w-full items-end justify-between gap-6 sm:flex-col sm:items-stretch">
            <div>
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-ink-faint">Valid through</p>
              <p className="mt-2 text-sm font-bold">31 DEC 2027</p>
            </div>
            <div>
              <div
                aria-hidden="true"
                className="h-12 w-24 bg-[repeating-linear-gradient(90deg,#17241f_0,#17241f_2px,transparent_2px,transparent_5px)] opacity-70 sm:w-full"
              />
              <p className="mt-2 text-right font-mono text-[0.5rem] tracking-[0.12em] text-ink-faint sm:text-left">
                0064 0100 0506
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-ink/15 px-5 py-4 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <span>Limited future-service issue</span>
        <span>Owner approval required to redeem</span>
      </div>
    </article>
  );
}
