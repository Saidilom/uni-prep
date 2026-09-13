"use client";

import { useTranslations } from "@/lib/i18n/locale-provider";
import type { LandingStats } from "@/lib/landing-stats";

// «Лист спецификации» — приём макета, которым он показывает сводку: шапка
// чертежа с шифром и номером листа, пронумерованные строки, крупное значение.
//
// Числа ЖИВЫЕ. В макете тут стояли «+42%», «40 центров» и «12 000+ учеников»,
// а в базе 88, 91, 275 и 3. Строка с нулём не рисуется: «0 центров» сообщает
// только то, что раздел недоделан.

export default function LandingSpecPlate({ stats }: { stats: LandingStats | null }) {
  const t = useTranslations("landingPlate");
  if (!stats) return null;

  const rows = [
    { value: stats.students, label: t("rowStudents"), note: t("rowStudentsNote") },
    { value: stats.attempts, label: t("rowAttempts"), note: t("rowAttemptsNote") },
    { value: stats.questions, label: t("rowQuestions"), note: t("rowQuestionsNote") },
    { value: stats.branches, label: t("rowBranches"), note: t("rowBranchesNote") },
  ].filter((row) => row.value > 0);

  if (rows.length === 0) return null;

  const cell = { color: "color-mix(in srgb, var(--color-text) 70%, transparent)" };

  return (
    <section className="py-[clamp(24px,3vw,40px)] pb-[clamp(40px,5vw,72px)]">
      <div className="blueprint">
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />

        <header
          className="flex flex-wrap items-stretch text-[13px] font-semibold uppercase tracking-[0.08em]"
          style={{ borderBottom: "1px solid var(--color-divider)" }}
        >
          <span className="min-w-0 flex-1 px-[clamp(14px,2vw,24px)] py-3 leading-6">{t("title")}</span>
          <span className="whitespace-nowrap px-6 py-3 leading-6" style={{ ...cell, borderLeft: "1px solid var(--color-divider)" }}>
            {t("code")}
          </span>
          <span className="whitespace-nowrap px-6 py-3 leading-6" style={{ ...cell, borderLeft: "1px solid var(--color-divider)" }}>
            {t("sheet")}
          </span>
        </header>

        <table className="table plate-table w-full table-fixed">
          <thead>
            <tr>
              <th scope="col">№</th>
              <th scope="col">{t("columnMetric")}</th>
              <th scope="col">{t("columnValue")}</th>
              <th scope="col">{t("columnNote")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.label}>
                <td
                  className="pl-[clamp(14px,2vw,24px)] text-[13px] font-semibold tracking-[0.08em]"
                  style={{ color: "var(--color-accent-700)" }}
                >
                  {String(index + 1).padStart(2, "0")}
                </td>
                <td className="text-[15px] leading-6">{row.label}</td>
                <td className="heading whitespace-nowrap text-[26px]">
                  {new Intl.NumberFormat("ru-RU").format(row.value)}
                </td>
                <td className="text-[15px]" style={{ color: "color-mix(in srgb, var(--color-text) 78%, transparent)" }}>
                  {row.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p
          className="m-0 px-6 py-3 text-[13px] leading-6"
          style={{ borderTop: "1px solid var(--color-divider)", ...cell }}
        >
          {t("footnote")}
        </p>
      </div>
    </section>
  );
}
