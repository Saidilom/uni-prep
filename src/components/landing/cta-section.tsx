"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "@/lib/i18n/locale-provider";

export default function LandingCtaSection() {
  const t = useTranslations("landingCta");
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl bg-[hsl(var(--brand-blue-ink))] px-8 py-14 text-center shadow-xl sm:px-16"
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[hsl(var(--brand-olive))]/30 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-white/10 blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />

        <div className="relative">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t("title")}</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/70 sm:text-base">
            {t("subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/join"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[hsl(var(--brand-blue-ink))] shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
            >
              {t("start")} <ArrowRight size={16} />
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-white/25 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              {t("login")}
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
