"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { formatScore } from "@/lib/certificate-scale";
import { gradeLevelDisplay } from "@/lib/mock-grade-level";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";
import type { LandingStats } from "@/lib/landing-stats";
import { LANDING_SCORE_MAX } from "@/lib/landing-stats";

// Блок «Результаты» — сильнейшая часть присланного макета.
//
// ═══ ЧТО ИЗМЕНЕНО ПРОТИВ МАКЕТА ═══
//
// В макете рядом с баллами стояли ИМЕНА — одиннадцать вымышленных человек.
// Здесь баллы настоящие, и поэтому имён нет: решение владельца. Балл экзамена
// рядом с фамилией это личные данные, а согласия на публикацию никто не давал.
//
// Сравнение «наши 72,4 против 51,0 по стране» тоже не перенесено: источника
// такого числа не существует. Вместо него — честное «что получает ученик»:
// протокол с погрешностью, который у нас действительно есть.

const SUBJECT_KEYS: Record<string, string> = {
  math: "subjectMath",
  physics: "subjectPhysics",
  chemistry: "subjectChemistry",
  biology: "subjectBiology",
  geography: "subjectGeography",
  history: "subjectHistory",
  english: "subjectEnglish",
  russian: "subjectNative",
  uzbek: "subjectNative",
  native: "subjectNative",
  it: "subjectIt",
};

export default function LandingResults({ stats }: { stats: LandingStats | null }) {
  const t = useTranslations("landingResults");
  const { locale } = useLocale();

  // Нет базы или нет ни одной опубликованной работы — блока просто нет.
  // Пустая витрина с заголовком «Результаты» хуже её отсутствия.
  if (!stats || stats.topResults.length === 0) return null;

  const best = stats.topResults[0];

  return (
    <section id="results" className="scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-olive-ink))]">
          {t("sectionLabel")}
        </p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="max-w-xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("subtitle").replace("{count}", String(stats.attempts))}
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          {/* Лучшие работы. Балл и уровень — без имён. */}
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.topResults.map((result, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-border bg-background p-4 transition-colors hover:border-[hsl(var(--brand-olive))]/40"
                >
                  <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                    {formatScore(result.score)}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--brand-olive-ink))]">
                    {gradeLevelDisplay(result.level, locale)}
                  </p>
                  <p className="mt-2 truncate text-[11px] text-muted-foreground">
                    {result.subjectId && SUBJECT_KEYS[result.subjectId]
                      ? t(SUBJECT_KEYS[result.subjectId] as "subjectMath")
                      : t("subjectOther")}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              {t("anonymousNote").replace("{max}", String(LANDING_SCORE_MAX))}
            </p>
          </div>

          {/* Протокол: что ученик получает после попытки. */}
          <div className="rounded-3xl bg-[hsl(var(--brand-olive-ink))] p-6 text-white shadow-sm sm:p-7">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
              {t("protocolLabel")}
            </p>
            <p className="mt-5 text-5xl font-bold tabular-nums tracking-tight">
              {formatScore(best.score)}
              <span className="ml-2 text-xl font-medium text-white/50">/ {LANDING_SCORE_MAX}</span>
            </p>
            <p className="mt-1 text-sm font-semibold text-white/80">
              {t("protocolLevel")} {gradeLevelDisplay(best.level, locale)}
            </p>

            <dl className="mt-6 space-y-3 border-t border-white/15 pt-5 text-sm">
              {([
                ["protocolRowError", "protocolRowErrorValue"],
                ["protocolRowScale", "protocolRowScaleValue"],
                ["protocolRowMistakes", "protocolRowMistakesValue"],
              ] as const).map(([labelKey, valueKey]) => (
                <div key={labelKey} className="flex items-baseline justify-between gap-4">
                  <dt className="text-white/60">{t(labelKey)}</dt>
                  <dd className="text-right font-semibold">{t(valueKey)}</dd>
                </div>
              ))}
            </dl>

            <Link
              href="/join"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[hsl(var(--brand-olive-ink))] transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("protocolCta")} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
