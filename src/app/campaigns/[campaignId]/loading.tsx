import { Container } from "@/components/ui/container";

const pulse = "motion-safe:animate-pulse rounded-sm bg-line/70";

export default function CampaignLoading() {
  return (
    <main id="main-content" className="py-10 sm:py-14">
      <Container>
        <div aria-label="Loading campaign" role="status">
          <div className="h-9 w-36 rounded-lg bg-line/70" />
          <div className="mt-5 overflow-hidden rounded-[3px] border border-ink/15 bg-paper">
            <div className="flex items-center justify-between border-b border-ink/15 px-5 py-4 sm:px-7">
              <div className="flex items-center gap-3">
                <div className="size-8 bg-line/70" />
                <div className="h-3 w-28 rounded-sm bg-line/70" />
              </div>
              <div className="h-3 w-24 rounded-sm bg-line/70" />
            </div>
            <div className="grid lg:grid-cols-[minmax(0,1.18fr)_minmax(21rem,0.82fr)]">
              <div className="min-w-0 p-6 sm:p-8 lg:p-10">
                <div className={`${pulse} h-3 w-44`} />
                <div className={`${pulse} mt-6 h-14 w-3/4 sm:h-20`} />
                <div className="mt-7 grid gap-3">
                  <div className={`${pulse} h-4 w-full`} />
                  <div className={`${pulse} h-4 w-5/6`} />
                  <div className={`${pulse} h-4 w-2/3`} />
                </div>
                <div className="mt-10 border-t border-ink/15 pt-6">
                  <div className={`${pulse} h-4 w-32`} />
                  <div className={`${pulse} mt-4 h-4 w-3/4`} />
                </div>
              </div>
              <div className="border-t border-dashed border-ink/25 bg-canvas/45 p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
                <div className={`${pulse} h-4 w-28`} />
                <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden border border-line bg-line">
                  {Array.from({ length: 6 }, (_, index) => (
                    <div className="bg-white p-4" key={index}>
                      <div className={`${pulse} h-3 w-16`} />
                      <div className={`${pulse} mt-3 h-5 w-20`} />
                    </div>
                  ))}
                </div>
                <div className={`${pulse} mt-6 h-12 w-full`} />
              </div>
            </div>
          </div>
          <div className="mt-12 border-t border-line pt-9">
            <div className={`${pulse} h-7 w-40`} />
            <div className={`${pulse} mt-5 h-32 w-full`} />
          </div>
          <span className="sr-only">Loading campaign details and on-chain activity</span>
        </div>
      </Container>
    </main>
  );
}
