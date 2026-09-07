// Generic post-Mock level, shown for every subject/mock (free or paid) —
// unlike src/lib/english-cefr.ts (which implements one specific government
// document for the English National Certificate), this has no official
// source: it's this platform's own A+..C scale, computed the same
// cohort-relative way (Rasch ability standardized to the same 0-75 scale
// via raschThetaToT — see src/lib/rasch.ts) so it stays comparable across
// subjects and mocks despite differing question counts/difficulty.
export type GradeLevel = "A+" | "A" | "B+" | "B" | "C+" | "C" | "below_c";

// Порог сравнивается с БЛИЖАЙШИМ целым T, а не с точным значением — решение
// владельца: «если ближе к 65 баллам, то уровень тот, что получает 65».
//
// Округление стоит внутри функции, а не в месте вызова: это свойство самой
// шкалы, и вызывающий не должен иметь возможности его забыть. Цена решения в
// том, что балл 86.4 будет подписан «A», хотя порог A на сотенной шкале —
// 86.67. Взамен ни один из 90 учеников, уже увидевших свой результат за
// 2026-09-06, не понижается задним числом: без этого правила ученик с
// T = 64,79 потерял бы «A» и получил «B+».
export function gradeLevelFromScore(score: number): GradeLevel {
  const t = Math.round(score);
  if (t >= 70) return "A+";
  if (t >= 65) return "A";
  if (t >= 60) return "B+";
  if (t >= 55) return "B";
  if (t >= 50) return "C+";
  if (t >= 46) return "C";
  return "below_c";
}

// "A+".."C" are already language-neutral letter badges, shown as-is
// everywhere — only "below_c" needs an actual localized label, per the
// BMBA-sourced spec this platform's grading matches ("Ниже C" / "C dan quyi").
const BELOW_C_LABEL: Record<"ru" | "uz", string> = {
  ru: "Ниже C",
  uz: "C dan quyi",
};

export function gradeLevelDisplay(level: GradeLevel, locale: "ru" | "uz"): string {
  return level === "below_c" ? BELOW_C_LABEL[locale] : level;
}
