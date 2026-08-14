"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowRight, Check, QrCode, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { PassPreview, type PassPreviewContent } from "@/components/home/pass-preview";
import { LandingStartActions } from "@/components/home/landing-start-actions";
import { RecentReviews } from "@/components/reviews/recent-reviews";
import { Container } from "@/components/ui/container";
import { ConnectedWalletLink } from "@/components/wallet/connected-wallet-link";
import type { ReviewDto, ReviewPageDto } from "@/features/reviews/dto";

const steps = [
  {
    number: "01",
    title: "The business sets the promise.",
    description:
      "Service, price, future value, supply, and expiration are made clear before a pass is sold.",
  },
  {
    number: "02",
    title: "Customers fund it today.",
    description:
      "Supporters pay with Stellar USDC and receive a unique pass tied to real service value.",
  },
  {
    number: "03",
    title: "The service completes the exchange.",
    description:
      "The owner approves redemption only when the merchant delivers the promised service.",
  },
];

interface CampaignStory {
  description: string;
  eyebrow: string;
  headline: string;
  id: string;
  preview: PassPreviewContent;
}

export const campaignStories: readonly CampaignStory[] = [
  {
    id: "northline",
    eyebrow: "One pass. Tangible value.",
    headline: "Five today. Six in service.",
    description:
      "Northline Studio pre-sells a limited run of appointments. Customers unlock more service value; the studio gets working capital when it matters.",
    preview: {
      businessName: "Northline Studio",
      icon: "scissors",
      issueNumber: "000064",
      issued: 100,
      passTitle: "Studio supporter pass",
      payToday: "5 USDC",
      remaining: 36,
      serial: "0064 0100 0506",
      serviceValue: "6 USDC",
      sold: 64,
      validThrough: "31 DEC 2027",
    },
  },
  {
    id: "harbor-cycle",
    eyebrow: "Local support. Road-ready service.",
    headline: "Eight today. Ten in service.",
    description:
      "Harbor Cycle Works funds a new repair stand by pre-selling tune-ups to neighborhood riders. Regulars receive extra service value while the workshop grows capacity.",
    preview: {
      businessName: "Harbor Cycle Works",
      icon: "bike",
      issueNumber: "000041",
      issued: 60,
      passTitle: "Quick tune-up pass",
      payToday: "8 USDC",
      remaining: 19,
      serial: "0041 0060 0810",
      serviceValue: "10 USDC",
      sold: 41,
      validThrough: "30 SEP 2027",
    },
  },
];

export function campaignStoryIndex(progress: number, currentIndex: number): number {
  if (currentIndex === 0) return progress >= 0.54 ? 1 : 0;
  return progress <= 0.46 ? 0 : 1;
}

function useCompactMotion() {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsCompact(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isCompact;
}

export function CinematicLanding({
  reviews = [],
  reviewPage,
}: {
  reviews?: ReviewDto[];
  reviewPage?: ReviewPageDto;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const campaignRef = useRef<HTMLElement>(null);
  const stepsRef = useRef<HTMLElement>(null);
  const businessRef = useRef<HTMLElement>(null);
  const trustRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const compactMotion = useCompactMotion();
  const motionEnabled = !reduceMotion && !compactMotion;
  const activeCampaignIndexRef = useRef(0);
  const [activeCampaignIndex, setActiveCampaignIndex] = useState(0);

  const { scrollYProgress: pageProgress } = useScroll({
    target: rootRef,
    offset: ["start start", "end end"],
  });
  const smoothPageProgress = useSpring(pageProgress, {
    stiffness: 80,
    damping: 24,
    mass: 0.35,
  });

  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroCopyY = useTransform(heroProgress, [0, 1], [0, 90]);
  const heroCopyOpacity = useTransform(heroProgress, [0, 0.7], [1, 0]);
  const heroRuleScale = useTransform(heroProgress, [0, 0.85], [1, 0.35]);

  const { scrollYProgress: campaignProgress } = useScroll({
    target: campaignRef,
    offset: ["start end", "end start"],
  });
  const smoothCampaign = useSpring(campaignProgress, {
    stiffness: 90,
    damping: 26,
    mass: 0.4,
  });
  const campaignScale = useTransform(smoothCampaign, [0, 0.42, 0.78, 1], [0.82, 1, 1, 0.94]);
  const campaignX = useTransform(smoothCampaign, [0, 0.42, 1], [110, 0, -28]);
  const campaignY = useTransform(smoothCampaign, [0, 0.42, 1], [90, 0, -40]);
  const campaignRotateY = useTransform(smoothCampaign, [0, 0.42, 1], [-9, 0, 2]);
  const campaignCopyY = useTransform(smoothCampaign, [0.12, 0.55, 0.9], [52, 0, -42]);

  useEffect(() => {
    let frame = 0;

    const updateStory = () => {
      frame = 0;
      const section = campaignRef.current;
      if (!section) return;

      const scrollDistance = Math.max(section.offsetHeight - window.innerHeight, 1);
      const progress = Math.min(Math.max(-section.getBoundingClientRect().top / scrollDistance, 0), 1);
      const nextIndex = campaignStoryIndex(progress, activeCampaignIndexRef.current);

      if (nextIndex === activeCampaignIndexRef.current) return;
      activeCampaignIndexRef.current = nextIndex;
      setActiveCampaignIndex(nextIndex);
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateStory);
    };

    updateStory();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const activeCampaign = campaignStories[activeCampaignIndex];
  const campaignDirection = activeCampaignIndex === 0 ? -1 : 1;

  const { scrollYProgress: stepsProgress } = useScroll({
    target: stepsRef,
    offset: ["start 80%", "end 35%"],
  });
  const smoothSteps = useSpring(stepsProgress, {
    stiffness: 75,
    damping: 24,
    mass: 0.4,
  });

  const { scrollYProgress: businessProgress } = useScroll({
    target: businessRef,
    offset: ["start end", "end start"],
  });
  const businessWordX = useTransform(businessProgress, [0, 1], [110, -120]);
  const businessCounterY = useTransform(businessProgress, [0.12, 0.55, 0.9], [70, 0, -45]);

  const { scrollYProgress: trustProgress } = useScroll({
    target: trustRef,
    offset: ["start end", "end start"],
  });
  const trustDepth = useTransform(trustProgress, [0, 0.48, 1], [0.9, 1, 0.96]);
  const trustCopyX = useTransform(trustProgress, [0.1, 0.52, 0.9], [-50, 0, 24]);

  return (
    <main ref={rootRef} id="main-content" className="overflow-clip bg-canvas">
      <motion.div
        aria-hidden="true"
        className="fixed left-0 top-0 z-50 h-[2px] w-full origin-left bg-coral"
        style={{ scaleX: reduceMotion ? 0 : smoothPageProgress }}
      />

      <section
        ref={heroRef}
        aria-labelledby="hero-title"
        className="relative isolate flex min-h-[calc(100svh-4.5rem)] overflow-hidden bg-ink text-white"
      >
        <video
          aria-hidden="true"
          autoPlay
          className="absolute inset-0 -z-30 h-full w-full object-cover"
          loop
          muted
          playsInline
          preload="metadata"
        >
          <source src="/bg.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 -z-20 bg-black/38" aria-hidden="true" />
        <div
          className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(12,18,15,0.82)_0%,rgba(12,18,15,0.5)_48%,rgba(12,18,15,0.12)_100%)]"
          aria-hidden="true"
        />

        <Container className="relative flex min-h-[calc(100svh-4.5rem)] flex-col justify-between pb-7 pt-16 sm:pb-9 sm:pt-20 lg:pb-10 lg:pt-24">
          <motion.div
            className="mobile-motion-reset max-w-[52rem]"
            style={motionEnabled ? { opacity: heroCopyOpacity, y: heroCopyY } : undefined}
          >
            <p className="flex items-center gap-3 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white/72 sm:text-xs">
              <span className="h-px w-9 bg-coral" aria-hidden="true" />
              Future service, funded today
            </p>
            <h1
              id="hero-title"
              className="landing-display mt-7 max-w-[12ch] text-[clamp(3.7rem,9.4vw,8.8rem)] font-medium leading-[0.84] tracking-[-0.07em] text-white"
            >
              Working capital,{" "}
              <span className="block text-mint">backed by real service.</span>
            </h1>
            <p className="mt-8 max-w-xl text-pretty text-base leading-7 text-white/75 sm:text-lg sm:leading-8">
              WrenPass helps small businesses pre-sell limited future service value to the customers who already believe in them.
            </p>
            <LandingStartActions />
          </motion.div>

          <div className="mt-14 grid gap-5 border-t border-white/30 pt-5 text-xs font-semibold text-white/72 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-10">
            <motion.p
              className="mobile-motion-reset"
              style={motionEnabled ? { scaleX: heroRuleScale, transformOrigin: "left" } : undefined}
            >
              Built for useful value, not speculation.
            </motion.p>
            <p>Fixed supply</p>
            <p>Owner-approved redemption</p>
          </div>
        </Container>
      </section>

      <section
        ref={campaignRef}
        id="campaign-example"
        aria-label="Campaign examples"
        className="relative min-h-[150svh] border-b border-line lg:min-h-[240vh]"
      >
        <div className="lg:sticky lg:top-18 lg:flex lg:min-h-[calc(100svh-4.5rem)] lg:items-center">
          <Container className="grid gap-14 py-22 sm:py-28 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-20 lg:py-18">
            <motion.div className="mobile-motion-reset" style={motionEnabled ? { y: campaignCopyY } : undefined}>
              <div aria-live="polite" className="grid" aria-atomic="true">
                <AnimatePresence initial={false}>
                  <motion.div
                    key={activeCampaign.id}
                    animate={{ opacity: 1, y: 0 }}
                    className="col-start-1 row-start-1"
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: campaignDirection * 22 }}
                    initial={reduceMotion ? false : { opacity: 0, y: campaignDirection * 26 }}
                    transition={{ duration: reduceMotion ? 0 : 0.48, ease: "easeOut" }}
                  >
                    <div className="flex max-w-md items-center justify-between gap-5">
                      <p className="eyebrow">{activeCampaign.eyebrow}</p>
                      <p className="shrink-0 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-ink-faint">
                        0{activeCampaignIndex + 1} / 02
                      </p>
                    </div>
                    <h2 className="landing-display mt-5 max-w-[9ch] text-[clamp(3.2rem,7vw,6.8rem)] leading-[0.9] tracking-[-0.065em] text-ink">
                      {activeCampaign.headline}
                    </h2>
                    <p className="mt-7 max-w-md text-base leading-8 text-ink-muted">
                      {activeCampaign.description}
                    </p>
                    <div className="mt-10 grid max-w-md grid-cols-3 border-y border-line py-5">
                      <div>
                        <p className="text-2xl font-bold tracking-tight text-ink">{activeCampaign.preview.issued}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-ink-faint">Issued</p>
                      </div>
                      <div className="border-x border-line px-5">
                        <p className="text-2xl font-bold tracking-tight text-ink">{activeCampaign.preview.sold}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-ink-faint">Sold</p>
                      </div>
                      <div className="pl-5">
                        <p className="text-2xl font-bold tracking-tight text-ink">{activeCampaign.preview.remaining}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-ink-faint">Remain</p>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>

            <div className="[perspective:1400px]">
              <motion.div
                className="mobile-motion-reset mx-auto w-full max-w-xl [transform-style:preserve-3d]"
                style={
                  motionEnabled
                    ? {
                        rotateY: campaignRotateY,
                        scale: campaignScale,
                        x: campaignX,
                        y: campaignY,
                      }
                    : undefined
                }
              >
                <div className="grid">
                  <AnimatePresence initial={false}>
                    <motion.div
                      key={activeCampaign.id}
                      animate={{ opacity: 1, rotateZ: 0, scale: 1, y: 0 }}
                      className="col-start-1 row-start-1"
                      exit={
                        reduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, rotateZ: campaignDirection * 1.4, scale: 0.975, y: campaignDirection * 28 }
                      }
                      initial={
                        reduceMotion
                          ? false
                          : { opacity: 0, rotateZ: campaignDirection * 1.6, scale: 0.975, y: campaignDirection * 36 }
                      }
                      transition={{ duration: reduceMotion ? 0 : 0.56, ease: "easeOut" }}
                    >
                      <PassPreview campaign={activeCampaign.preview} />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.div>
            </div>
          </Container>
        </div>
      </section>

      <section
        ref={stepsRef}
        id="how-it-works"
        aria-labelledby="steps-title"
        className="scroll-mt-24 bg-white py-24 sm:py-32 lg:py-40"
      >
        <Container>
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div>
              <p className="eyebrow">The exchange</p>
              <h2
                id="steps-title"
                className="landing-display mt-5 max-w-[8ch] text-[clamp(3.1rem,6vw,6.2rem)] leading-[0.9] tracking-[-0.06em] text-ink"
              >
                Support moves forward.
              </h2>
            </div>
            <p className="max-w-xl self-end text-lg leading-8 text-ink-muted lg:justify-self-end">
              A deliberate three-part flow connects today&apos;s support with tomorrow&apos;s service—without turning the relationship into a trade.
            </p>
          </div>

          <div className="relative mt-18 sm:mt-24">
            <div className="absolute left-0 top-0 h-px w-full bg-line" aria-hidden="true" />
            <motion.div
              className="absolute left-0 top-0 h-px w-full origin-left bg-forest"
              style={{ scaleX: reduceMotion ? 1 : smoothSteps }}
              aria-hidden="true"
            />
            <div className="grid lg:grid-cols-3">
              {steps.map((step, index) => (
                <article
                  key={step.number}
                  className="border-b border-line py-10 lg:min-h-80 lg:border-b-0 lg:border-r lg:px-9 lg:py-12 first:lg:pl-0 last:lg:border-r-0 last:lg:pr-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="landing-display text-5xl tracking-[-0.05em] text-coral">{step.number}</span>
                    <span className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-ink-faint">
                      {index === 0 ? "Define" : index === 1 ? "Fund" : "Fulfill"}
                    </span>
                  </div>
                  <h3 className="mt-12 max-w-xs text-2xl font-bold leading-tight tracking-[-0.035em] text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-4 max-w-sm text-sm leading-7 text-ink-muted">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section
        ref={businessRef}
        id="for-merchants"
        aria-labelledby="business-title"
        className="relative scroll-mt-24 overflow-hidden bg-coral py-24 text-ink sm:py-32 lg:py-40"
      >
        <motion.p
          aria-hidden="true"
          className="mobile-motion-reset landing-display pointer-events-none absolute left-[-2vw] top-8 whitespace-nowrap text-[clamp(6rem,18vw,17rem)] leading-none tracking-[-0.075em] text-ink/[0.07]"
          style={motionEnabled ? { x: businessWordX } : undefined}
        >
          LIMITED / USEFUL / LOCAL
        </motion.p>
        <Container className="relative grid gap-16 lg:grid-cols-[1.08fr_0.92fr] lg:items-end lg:gap-24">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink/60">For local businesses</p>
            <h2
              id="business-title"
              className="landing-display mt-6 max-w-[10ch] text-[clamp(3.6rem,7.5vw,7.6rem)] leading-[0.88] tracking-[-0.07em]"
            >
              Fund what comes next, with what you do best.
            </h2>
          </div>
          <motion.div
            className="mobile-motion-reset border-l border-ink/25 pl-6 sm:pl-9"
            style={motionEnabled ? { y: businessCounterY } : undefined}
          >
            <p className="max-w-md text-lg leading-8 text-ink/75">
              Set a finite offer. Make the terms visible. Receive working capital without presenting service value as an investment.
            </p>
            <dl className="mt-12 grid grid-cols-2 border-y border-ink/25 py-6">
              <div>
                <dt className="text-[0.65rem] font-bold uppercase tracking-[0.17em] text-ink/55">Maximum supply</dt>
                <dd className="landing-display mt-2 text-5xl tracking-[-0.05em]">100</dd>
              </div>
              <div className="border-l border-ink/25 pl-6">
                <dt className="text-[0.65rem] font-bold uppercase tracking-[0.17em] text-ink/55">Ownership truth</dt>
                <dd className="mt-5 text-xl font-bold tracking-tight">On-chain</dd>
              </div>
            </dl>
          </motion.div>
        </Container>
      </section>

      <section
        ref={trustRef}
        id="trust"
        aria-labelledby="trust-title"
        className="relative scroll-mt-24 overflow-hidden bg-ink py-24 text-white sm:py-32 lg:min-h-screen lg:py-0"
      >
        <Container className="flex min-h-full items-center lg:min-h-screen">
          <motion.div
            className="mobile-motion-reset grid w-full gap-16 lg:grid-cols-[1fr_0.78fr] lg:items-center lg:gap-24 [perspective:1200px]"
            style={motionEnabled ? { scale: trustDepth } : undefined}
          >
            <motion.div className="mobile-motion-reset" style={motionEnabled ? { x: trustCopyX } : undefined}>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-mint">Designed around trust</p>
              <h2
                id="trust-title"
                className="landing-display mt-6 max-w-[11ch] text-[clamp(3.4rem,7vw,7.4rem)] leading-[0.88] tracking-[-0.065em]"
              >
                The QR identifies. The owner authorizes.
              </h2>
              <p className="mt-8 max-w-xl text-lg leading-8 text-white/62">
                Scanning alone can never spend someone else&apos;s service value. WrenPass makes every redemption a deliberate handoff between customer and merchant.
              </p>
            </motion.div>

            <div className="relative mx-auto w-full max-w-md border border-white/20 p-7 sm:p-10">
              <div className="flex items-start justify-between border-b border-white/15 pb-8">
                <div>
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-white/42">Redemption protocol</p>
                  <p className="mt-2 font-mono text-xs text-white/72">PASS // WP-000064</p>
                </div>
                <QrCode aria-hidden="true" className="size-16 text-white" strokeWidth={1.2} />
              </div>
              <div className="space-y-7 py-8">
                <div className="flex gap-4">
                  <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-mint" />
                  <div>
                    <p className="font-bold">Pass ownership verified</p>
                    <p className="mt-1 text-sm leading-6 text-white/50">Current owner is checked on-chain.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <ShieldCheck aria-hidden="true" className="mt-1 size-4 shrink-0 text-mint" />
                  <div>
                    <p className="font-bold">Owner approval required</p>
                    <p className="mt-1 text-sm leading-6 text-white/50">Before every redemption.</p>
                  </div>
                </div>
              </div>
              <div className="border-t border-white/15 pt-5 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-white/36">
                Scan ≠ spend authority
              </div>
            </div>
          </motion.div>
        </Container>
      </section>

      <RecentReviews initialPage={reviewPage} reviews={reviews} />

      <section aria-labelledby="closing-title" className="relative overflow-hidden bg-canvas py-24 sm:py-32 lg:py-40">
        <Container>
          <p className="eyebrow">WrenPass / Built on Stellar</p>
          <h2
            id="closing-title"
            className="landing-display mt-7 max-w-[13ch] text-[clamp(3.5rem,8vw,8.4rem)] leading-[0.86] tracking-[-0.07em] text-ink"
          >
            Let tomorrow&apos;s service fund today&apos;s possibility.
          </h2>
          <div className="mt-12 flex flex-col gap-8 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-lg text-base leading-7 text-ink-muted">
              Clear terms. Limited passes. Real service from businesses people already value.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex h-12 items-center justify-center gap-3 rounded-[2px] border border-ink/20 px-6 text-sm font-bold text-ink transition-colors hover:border-ink hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest"
                href="#how-it-works"
              >
                See how it works
              </Link>
              <ConnectedWalletLink
                className="inline-flex h-12 items-center justify-center gap-3 rounded-[2px] bg-forest px-6 text-sm font-bold text-white transition-colors hover:bg-forest-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest"
                href="/merchant"
              >
                Create a campaign
                <ArrowRight aria-hidden="true" className="size-4" />
              </ConnectedWalletLink>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}
