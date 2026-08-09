import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  HandHeart,
  QrCode,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";
import Link from "next/link";

import { PassPreview } from "@/components/home/pass-preview";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { MotionReveal } from "@/components/ui/motion-reveal";

const trustPoints = [
  { icon: BadgeCheck, label: "Fixed pass supply" },
  { icon: ShieldCheck, label: "Clear protection rules" },
  { icon: QrCode, label: "Owner-approved redemption" },
];

const steps = [
  {
    icon: Store,
    number: "01",
    title: "Create a limited pass",
    description: "A business defines the service, future value, price, supply, and expiration up front.",
  },
  {
    icon: CircleDollarSign,
    number: "02",
    title: "Customers fund it today",
    description: "Supporters pay with Stellar USDC and receive a unique pass for real business value.",
  },
  {
    icon: HandHeart,
    number: "03",
    title: "Deliver and redeem",
    description: "The owner approves redemption when the merchant delivers the promised service.",
  },
];

export default function Home() {
  return (
    <main id="main-content">
      <section className="hero-grid overflow-hidden border-b border-line py-14 sm:py-18 lg:py-22">
        <Container className="grid items-center gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
          <MotionReveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-coral/25 bg-coral-soft px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-coral-strong">
              <Sparkles aria-hidden="true" className="size-3.5" />
              Local support, made practical
            </span>
            <h1 className="mt-6 max-w-3xl text-balance text-4xl font-extrabold tracking-[-0.045em] text-ink sm:text-5xl lg:text-6xl lg:leading-[1.02]">
              Working capital,
              <span className="text-forest"> backed by real service.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-ink-muted">
              WrenPass helps small businesses pre-sell limited future service value to the customers who already believe in them.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link className={buttonStyles({ size: "lg" })} href="#how-it-works">
                Explore the model
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link className={buttonStyles({ variant: "secondary", size: "lg" })} href="/merchant">
                Create a campaign
              </Link>
            </div>
            <div className="mt-9 grid gap-3 sm:grid-cols-3">
              {trustPoints.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-forest" />
                  {label}
                </div>
              ))}
            </div>
          </MotionReveal>

          <MotionReveal className="relative mx-auto w-full max-w-xl lg:max-w-none" delay={0.1}>
            <div className="absolute -left-8 -top-8 size-28 rounded-full bg-mint-soft blur-2xl" aria-hidden="true" />
            <div className="absolute -bottom-8 -right-8 size-32 rounded-full bg-coral-soft blur-2xl" aria-hidden="true" />
            <PassPreview />
          </MotionReveal>
        </Container>
      </section>

      <section id="how-it-works" className="scroll-mt-24 py-18 sm:py-22">
        <Container>
          <div className="max-w-2xl">
            <p className="eyebrow">How WrenPass works</p>
            <h2 className="section-title">A straightforward exchange of support and service.</h2>
            <p className="section-copy">
              No speculative token and no trading marketplace—just transparent terms that support a real merchant-customer relationship.
            </p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {steps.map(({ description, icon: Icon, number, title }) => (
              <Card key={number} className="group p-6 transition-transform duration-200 hover:-translate-y-1 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-2xl bg-sage-soft text-forest">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="text-sm font-extrabold tracking-[0.14em] text-ink-faint">{number}</span>
                </div>
                <h3 className="mt-8 text-xl font-bold tracking-tight text-ink">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink-muted">{description}</p>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section id="for-merchants" className="scroll-mt-24 border-y border-line bg-white py-18 sm:py-22">
        <Container className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
          <div>
            <p className="eyebrow">For local businesses</p>
            <h2 className="section-title">Raise funds without pretending service value is an investment.</h2>
            <p className="section-copy">
              Customers know exactly what they pay, what service value they receive, when it expires, and what amount is protected by the contract rules.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-6">
              <CalendarClock aria-hidden="true" className="size-6 text-coral-strong" />
              <p className="mt-6 text-3xl font-extrabold tracking-tight text-ink">100</p>
              <p className="mt-1 text-sm font-semibold text-ink-muted">Maximum passes, set in advance</p>
            </Card>
            <Card className="p-6 sm:translate-y-6">
              <ShieldCheck aria-hidden="true" className="size-6 text-forest" />
              <p className="mt-6 text-3xl font-extrabold tracking-tight text-ink">On-chain</p>
              <p className="mt-1 text-sm font-semibold text-ink-muted">Ownership and redemption truth</p>
            </Card>
          </div>
        </Container>
      </section>

      <section id="trust" className="scroll-mt-24 py-18 sm:py-22">
        <Container>
          <Card className="overflow-hidden bg-ink p-7 text-white sm:p-10 lg:p-12">
            <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-mint">Designed around trust</p>
                <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.035em] sm:text-4xl">
                  The QR identifies the pass. The wallet owner authorizes its use.
                </h2>
                <p className="mt-5 max-w-xl text-base leading-7 text-white/65">
                  WrenPass keeps redemption deliberate: scanning alone can never spend someone else&apos;s service value.
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
                <ShieldCheck aria-hidden="true" className="size-6 text-mint" />
                <div>
                  <p className="font-bold">Owner approval required</p>
                  <p className="mt-0.5 text-sm text-white/55">Before every redemption</p>
                </div>
              </div>
            </div>
          </Card>
        </Container>
      </section>
    </main>
  );
}
