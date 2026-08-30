"use client";

import { useRef, type MouseEvent } from "react";
import Image from "next/image";
import { motion, useMotionValue, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { ClipboardCheck, FileText, BarChart3, GraduationCap, Shield, type LucideIcon } from "lucide-react";
import { APP_NAME } from "@/lib/app-config";
import { useTranslations } from "@/lib/i18n/locale-provider";

type Feature = { icon: LucideIcon; title: string; description: string; side: "left" | "right" };

function useFeatures(): Feature[] {
  const t = useTranslations("landingFeatures");
  return [
    { icon: ClipboardCheck, title: t("schoolTitle"), description: t("schoolDescription"), side: "left" },
    { icon: FileText, title: t("mockTitle"), description: t("mockDescription"), side: "right" },
    { icon: BarChart3, title: t("resultsTitle"), description: t("resultsDescription"), side: "left" },
    { icon: GraduationCap, title: t("teacherTitle"), description: t("teacherDescription"), side: "right" },
    { icon: Shield, title: t("adminTitle"), description: t("adminDescription"), side: "left" },
  ];
}

const FEATURES_COUNT = 5;
const STEP = 1 / FEATURES_COUNT;
// Cards used to take 80% of their slice to fully appear; shrinking the
// window (and spring-smoothing the result below) makes each one snap in
// sooner and less linearly — "faster and smoother" per user feedback.
const REVEAL_FRACTION = 0.45;
const SPRING = { stiffness: 260, damping: 30, mass: 0.5 };

function FeatureBlock({ feature, order, progress }: { feature: Feature; order: number; progress: MotionValue<number> }) {
  const start = order * STEP;
  const end = start + STEP * REVEAL_FRACTION
  
  const opacity = useSpring(useTransform(progress, [start, end], [0, 1]), SPRING);
  const x = useSpring(useTransform(progress, [start, end], [feature.side === "left" ? -56 : 56, 0]), SPRING);

  return (
    <motion.div
      style={{ opacity, x }}
      className={`flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm ${
        feature.side === "right" ? "sm:flex-row-reverse sm:text-right" : ""
      }`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
        <feature.icon size={20} strokeWidth={1.75} />
      </span>
      <div>
        <h3 className="font-semibold text-foreground">{feature.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
      </div>
    </motion.div>
  );
}

// Mobile/tablet fallback: the same tilt-on-hover grid used before — a pinned
// centered scroll story doesn't translate to short, touch-scrolled viewports.
function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-40, 40], [7, -7]), { stiffness: 250, damping: 20 });
  const rotateY = useSpring(useTransform(x, [-40, 40], [-7, 7]), { stiffness: 250, damping: 20 });

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set(event.clientX - rect.left - rect.width / 2);
    y.set(event.clientY - rect.top - rect.height / 2);
  };
  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, delay: index * 0.06 }}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
        <feature.icon size={20} strokeWidth={1.75} />
      </span>
      <h3 className="mt-4 font-semibold text-foreground">{feature.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
    </motion.div>
  );
}

export default function LandingFeatures() {
  const targetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: targetRef, offset: ["start start", "end end"] });
  const t = useTranslations("landingFeatures");
  const features = useFeatures();

  const badgeY = useSpring(useTransform(scrollYProgress, [0, 1], [-30, 200]), SPRING);

  const leftFeatures = features.filter((f) => f.side === "left");
  const rightFeatures = features.filter((f) => f.side === "right");

  return (
    <section id="features" className="border-b border-border">
      {/* Desktop: the badge drifts straight down the middle as you scroll,
          while feature cards fade in from the left/right in reading order. */}
      <div ref={targetRef} className="relative hidden h-[280vh] lg:block">
        <div className="sticky top-0 flex h-screen items-center overflow-hidden">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-10 px-6">
            <div className="flex flex-col gap-5">
              {leftFeatures.map((f) => (
                <FeatureBlock key={f.title} feature={f} order={features.indexOf(f)} progress={scrollYProgress} />
              ))}
            </div>

            <div className="flex flex-col items-center gap-6">
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("sectionLabel")}
              </span>
              <motion.div style={{ y: badgeY }} className="relative flex h-40 w-40 shrink-0 items-center justify-center">
                <motion.span
                  aria-hidden
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 rounded-full border-2 border-dashed border-[hsl(var(--brand-blue-ink))]/25"
                />
                <motion.span
                  aria-hidden
                  animate={{ rotate: -360 }}
                  transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-3 rounded-full border border-[hsl(var(--brand-olive))]/25"
                />
                <div className="relative h-20 w-20 rounded-full bg-card p-4 shadow-xl sm:h-24 sm:w-24">
                  <Image src="/registan-logo.png" alt={APP_NAME} fill className="object-contain p-3" />
                </div>
              </motion.div>
            </div>

            <div className="flex flex-col gap-5">
              {rightFeatures.map((f) => (
                <FeatureBlock key={f.title} feature={f} order={features.indexOf(f)} progress={scrollYProgress} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile/tablet: plain grid */}
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:hidden">
        <div className="max-w-xl">
          <h2 className="text-2xl font-bold tracking-tight text-[hsl(var(--brand-blue-ink))] sm:text-3xl">
            {t("mobileTitle")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("mobileSubtitle")}
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2" style={{ perspective: 1000 }}>
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
