"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Scene3DLoader from "./scene-3d-loader";
import { useTranslations } from "@/lib/i18n/locale-provider";
import type { LandingStats } from "@/lib/landing-stats";

// Первый экран — по присланному макету.
//
// ═══ ЧТО ВЗЯТО ═══
//
// Тёмное полотно, крупный круг за заголовком, заголовок с засечками по центру,
// две кнопки-таблетки и строка с числом под ними.
//
// ═══ ЧТО СДЕЛАНО ИНАЧЕ, И ПОЧЕМУ ═══
//
// 1. Цвет круга наш (--brand-olive), а не бордовый: решение владельца.
//
// 2. Заголовок СВЕТЛЫЙ. В макете он тёмный поверх тёмно-бордового круга и
//    читается с трудом — на скриншоте видно, как слово «видно» тонет в фоне.
//    Повторять это нельзя: заголовок — единственное, ради чего страницу
//    открывают.
//
// 3. Число под кнопками настоящее (сколько учеников в базе), а не «12 000+»
//    из макета. При пустой базе строка не рисуется вовсе.

export default function LandingHero({ stats }: { stats: LandingStats | null }) {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const t = useTranslations("landingHero");

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-[#0b0f0f] text-white">
      {/* Круг за заголовком. Позиционируется от верха и центра, поэтому на
          узком экране не уезжает за край и не режет текст. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-38%] h-[85vw] w-[85vw] max-h-[760px] max-w-[760px] -translate-x-1/2 rounded-full bg-[hsl(var(--brand-olive))] opacity-90 blur-[2px] sm:top-[-30%]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0b0f0f]"
      />

      <div className="relative mx-auto max-w-4xl px-5 pb-14 pt-20 text-center sm:px-6 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <h1 className="font-display text-[2.6rem] font-bold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
            {t("titleLead")}{" "}
            <span className="text-white/70">{t("titleHighlight")}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base">
            {t("subtitle")}
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/join"
              className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand-olive))] px-7 py-4 text-sm font-bold text-white shadow-lg transition-all hover:brightness-110 active:scale-[0.97]"
            >
              {t("start")} <ArrowRight size={16} />
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-white px-7 py-4 text-sm font-bold text-[#0b0f0f] transition-all hover:bg-white/90 active:scale-[0.97]"
            >
              {t("login")}
            </Link>
          </div>

          {stats && stats.students > 0 && (
            <p className="mt-7 text-xs text-white/40 sm:text-sm">
              {t("studentsNote").replace("{count}", new Intl.NumberFormat("ru-RU").format(stats.students))}
            </p>
          )}
        </motion.div>

        {/* Трёхмерная сцена вместо «скриншота платформы» из макета: она уже
            написана, грузится лениво и не требует картинок, которых у нас нет. */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.15 }}
          className="relative mt-12 h-[280px] sm:h-[380px]"
        >
          <Scene3DLoader scrollProgress={scrollYProgress} />
        </motion.div>
      </div>
    </section>
  );
}
