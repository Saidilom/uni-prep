"use client";

import Link from "next/link";
import { formatScore } from "@/lib/certificate-scale";
import { gradeLevelDisplay } from "@/lib/mock-grade-level";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";
import { LANDING_SCORE_MAX, type LandingStats } from "@/lib/landing-stats";

// Блок «Результаты» — по макету: слева таблица работ, справа карточка
// протокола и врезка с призывом.
//
// ═══ ДВА ОТЛИЧИЯ ОТ МАКЕТА, И ОБА НАМЕРЕННЫЕ ═══
//
// 1. В колонке «Ученик» у макета одиннадцать имён. Здесь баллы настоящие,
//    поэтому вместо имени стоит предмет: балл экзамена рядом с фамилией это
//    личные данные, согласия на публикацию никто не давал.
//
// 2. Полоса «Ученики Registan 72,4 против средний по стране 51,0» не
//    перенесена. Источника второго числа не существует, а после перехода на
//    центрирование по потоку средний балл любого теста равен ровно 50 по
//    построению — сравнивать им нечего.

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

  if (!stats || stats.topResults.length === 0) return null;
  const best = stats.topResults[0];

  return (
    <section id="results" className="scroll-mt-16 py-[clamp(32px,4vw,56px)]">
      <span className="eyebrow">{t("sectionLabel")}</span>
      <div className="rule" />
      <h2 className="max-w-[22ch] text-[clamp(30px,3.6vw,46px)] leading-[1.06]">{t("title")}</h2>
      <p
        className="mt-5 max-w-[52ch] text-[16px] leading-6"
        style={{ color: "color-mix(in srgb, var(--color-text) 82%, transparent)" }}
      >
        {t("subtitle").replace("{count}", String(stats.attempts))}
      </p>

      <div className="mt-10 grid items-start gap-[clamp(24px,4vw,56px)] lg:grid-cols-2">
        {/* Таблица работ */}
        <div className="blueprint">
          <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
          <table className="table">
            <thead>
              <tr>
                <th scope="col" className="pl-5">№</th>
                <th scope="col">{t("columnSubject")}</th>
                <th scope="col">{t("columnScore")}</th>
                <th scope="col">{t("columnLevel")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.topResults.map((result, index) => (
                <tr key={index}>
                  <td className="pl-5 text-[13px] font-semibold tracking-[0.08em]" style={{ color: "var(--color-accent-700)" }}>
                    {String(index + 1).padStart(2, "0")}
                  </td>
                  <td className="text-[15px] leading-6">
                    {result.subjectId && SUBJECT_KEYS[result.subjectId]
                      ? t(SUBJECT_KEYS[result.subjectId] as "subjectMath")
                      : t("subjectOther")}
                  </td>
                  <td className="heading text-[17px] tabular-nums">{formatScore(result.score)}</td>
                  <td>
                    <span className="tag tag-outline">{gradeLevelDisplay(result.level, locale)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3" style={{ borderTop: "1px solid var(--color-divider)" }}>
            <p className="text-[13px] leading-5" style={{ color: "color-mix(in srgb, var(--color-text) 70%, transparent)" }}>
              {t("anonymousNote").replace("{max}", String(LANDING_SCORE_MAX))}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-10">
          {/* Протокол */}
          <div className="blueprint">
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            <header
              className="flex items-center justify-between gap-4 px-5 py-3 text-[13px] uppercase tracking-[0.08em]"
              style={{ borderBottom: "1px solid var(--color-divider)" }}
            >
              <span>{t("protocolLabel")}</span>
              <span className="tag tag-accent">{gradeLevelDisplay(best.level, locale)}</span>
            </header>

            <div className="grid" style={{ gap: "1px", background: "var(--color-divider)" }}>
              {[
                [t("protocolRowScore"), `${formatScore(best.score)} / ${LANDING_SCORE_MAX}`],
                [t("protocolRowError"), t("protocolRowErrorValue")],
                [t("protocolRowScale"), t("protocolRowScaleValue")],
                [t("protocolRowMistakes"), t("protocolRowMistakesValue")],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 px-5 py-4" style={{ background: "var(--color-bg)" }}>
                  <span className="text-[13px] uppercase tracking-[0.08em]" style={{ color: "color-mix(in srgb, var(--color-text) 70%, transparent)" }}>
                    {label}
                  </span>
                  <span className="heading text-right text-[17px]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Врезка с призывом */}
          <div className="blueprint p-5">
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            <h3 className="text-[22px] leading-tight">{t("ctaTitle")}</h3>
            <p className="mt-3 text-[15px] leading-6" style={{ color: "color-mix(in srgb, var(--color-text) 82%, transparent)" }}>
              {t("ctaBody")}
            </p>
            <Link href="/join" className="btn btn-primary btn-block mt-5">
              {t("protocolCta")} →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
