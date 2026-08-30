"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Scene3DLoader from "./scene-3d-loader";
import { useTranslations } from "@/lib/i18n/locale-provider";

export default function LandingHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const t = useTranslations("landingHero");

  return (
    <section ref={sectionRef} className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-10 pt-16 sm:pt-20 lg:grid-cols-2 lg:gap-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--brand-blue-ink))]">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--brand-blue-ink))]" />
            {t("badge")}
          </span>
          <h1 className="mt-5 text-5xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            {t("titleLead")}{" "}
            <span className="text-[hsl(var(--brand-blue-ink))]">{t("titleHighlight")}</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/join"
              className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand-blue-ink))] px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
            >
              {t("start")} <ArrowRight size={16} />
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-border bg-[hsl(var(--brand-blue-soft))] px-6 py-3.5 text-sm font-semibold text-[hsl(var(--brand-blue-ink))] transition-colors hover:brightness-95"
            >
              {t("login")}
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.15 }}
          className="relative h-[340px] sm:h-[440px] lg:h-[500px]"
        >
          <Scene3DLoader scrollProgress={scrollYProgress} />
        </motion.div>
      </div>
    </section>
  );
}
