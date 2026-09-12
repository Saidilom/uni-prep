"use client";

import { useTranslations } from "@/lib/i18n/locale-provider";
import type { LandingStats } from "@/lib/landing-stats";

// Полоса чисел под героем — из присланного макета.
//
// Числа ЖИВЫЕ: в макете на этом месте стояли «12 000+ учеников» и «40 учебных
// центров», а в базе 88 и 3. Решение владельца — показывать настоящие. Они
// растут сами, и переписывать витрину при каждом наборе не придётся.
//
// Нули не рисуются: строка «0 филиалов» не сообщает ничего, кроме того, что
// раздел недоделан.

export default function LandingStatsStrip({ stats }: { stats: LandingStats | null }) {
  const t = useTranslations("landingStats");
  if (!stats) return null;

  const items = [
    { value: stats.students, label: t("students") },
    { value: stats.attempts, label: t("attempts") },
    { value: stats.questions, label: t("questions") },
    { value: stats.branches, label: t("branches") },
  ].filter((item) => item.value > 0);

  if (items.length === 0) return null;

  return (
    <section className="px-4 pb-6 sm:px-6">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="bg-card px-5 py-6 text-center sm:px-6 sm:py-7">
            <p className="text-3xl font-bold tabular-nums tracking-tight text-[hsl(var(--brand-olive-ink))] sm:text-4xl">
              {new Intl.NumberFormat("ru-RU").format(item.value)}
            </p>
            <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
              {item.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
