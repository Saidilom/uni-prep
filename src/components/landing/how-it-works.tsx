"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useTranslations } from "@/lib/i18n/locale-provider";

function useSteps() {
  const t = useTranslations("landingHowItWorks");
  return [
    { number: "01", title: t("step1Title"), description: t("step1Description") },
    { number: "02", title: t("step2Title"), description: t("step2Description") },
    { number: "03", title: t("step3Title"), description: t("step3Description") },
    { number: "04", title: t("step4Title"), description: t("step4Description") },
  ];
}

type Step = ReturnType<typeof useSteps>[number];

function StepCard({ step }: { step: Step }) {
  return (
    <div className="flex h-[280px] w-[260px] shrink-0 flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm sm:h-[300px] sm:w-[300px]">
      <span className="text-3xl font-extrabold tabular-nums text-[hsl(var(--brand-blue-ink))]/25">{step.number}</span>
      <div>
        <h3 className="font-semibold text-foreground">{step.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
      </div>
    </div>
  );
}

function IntroPanel() {
  const t = useTranslations("landingHowItWorks");
  return (
    <div className="w-[220px] sm:w-[300px]">
      <span className="text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--brand-blue-ink))]">
        {t("eyebrow")}
      </span>
      <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
        {t("titleLine1")}
        <br /> {t("titleLine2")}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {t("subtitle")}
      </p>
    </div>
  );
}

export default function LandingHowItWorks() {
  const targetRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrollDistance, setScrollDistance] = useState(0);
  const steps = useSteps();

  useEffect(() => {
    function measure() {
      if (!trackRef.current || !laneRef.current) return;
      const trackWidth = trackRef.current.scrollWidth;
      const laneWidth = laneRef.current.clientWidth;
      setScrollDistance(Math.max(0, trackWidth - laneWidth));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const { scrollYProgress } = useScroll({ target: targetRef, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -scrollDistance]);

  return (
    <section id="how-it-works" className="border-y border-border bg-card/50">
      {/* Desktop: pinned intro panel + horizontal reveal driven by vertical scroll.
          The card track lives in its own overflow-hidden "lane" so it clips
          against its own left edge as it slides — it never visually crosses
          into the (untouched, always-visible) intro panel next to it. */}
      <div ref={targetRef} className="relative hidden h-[300vh] lg:block">
        <div className="sticky top-0 flex h-screen items-center overflow-hidden">
          <div className="flex w-full items-center gap-10 pl-6 xl:pl-[calc((100vw-72rem)/2)]">
            <div className="shrink-0">
              <IntroPanel />
            </div>
            <div ref={laneRef} className="min-w-0 flex-1 overflow-hidden">
              <motion.div ref={trackRef} style={{ x }} className="flex w-max gap-6 pr-[10vw]">
                {steps.map((step) => (
                  <StepCard key={step.number} step={step} />
                ))}
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile/tablet: plain stacked list — a pinned horizontal reveal doesn't
          translate to narrow, touch-scrolled viewports. */}
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:hidden">
        <IntroPanel />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: index * 0.08 }}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <span className="text-2xl font-extrabold tabular-nums text-[hsl(var(--brand-blue-ink))]/25">
                {step.number}
              </span>
              <h3 className="mt-3 font-semibold text-foreground">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
