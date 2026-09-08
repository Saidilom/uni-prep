// Уровень A+..C после мока — для любого предмета, платного и бесплатного.
// В отличие от src/lib/english-cefr.ts (там реализован один конкретный
// государственный документ для английского), пороги здесь взяты из
// Baholash_mezoni.pdf и ЗАДАНЫ, а не выведены: движок их применяет, но не
// устанавливает (design/RASCH.md, ТЗ L.3).
//
// Считается от T-шкалы 0–75, которую даёт raschThetaToT. Уровень больше НЕ
// относителен когорте: с этапа 1 T = 10·θ + 50 относительно эталонной
// популяции (src/lib/reference-population.ts), поэтому одинаковая способность
// даёт одинаковую букву независимо от того, кто ещё сдавал этот мок.
export type GradeLevel = "A+" | "A" | "B+" | "B" | "C+" | "C" | "below_c";

// Полосы уровней — ПОЛУОТКРЫТЫЕ ИНТЕРВАЛЫ по точному T, без округления:
//
//   [0, 46) ниже C   [46, 50) C   [50, 55) C+   [55, 60) B
//   [60, 65) B+      [65, 70) A   [70, ∞) A+
//
// Раньше T округлялся до ближайшего целого («если ближе к 65 — значит 65»).
// Это неверно: полоса — интервал, а не точка, к которой округляют, и на
// T ∈ [64.5, 65) правило выдавало A там, где норма требует B+ (ТЗ §0.3:
// «65 – 69.9 → A», «60 – 64.9 → B+»). Ошибка классификации ровно у границы —
// то есть там, где её цена максимальна (L.5).
//
// Перехода на интервалы никто не заметил: на момент правки T не превышал 57.9
// по математике и 29.78 по узбекскому, и ни одна из 90 работ в спорные окна не
// попадала — проверено запросом из design/RASCH.md, часть VII (расхождений 0).
//
// Верхняя полоса открыта справа, [70, ∞), и это закрывает дыру в таблице ТЗ:
// там стоят «> 70 → A+» и «65 – 69.9 → A», между ними ровно 70.0 не покрыто
// ничем. Здесь 70.0 даёт A+ по построению, а не по случайности.
//
// Округление до одной десятой осталось только на ПОКАЗ балла (roundScore,
// src/lib/certificate-scale.ts). Порядок жёсткий: сначала полоса по точному
// значению, потом округление для отображения — не наоборот.
export function gradeLevelFromScore(score: number): GradeLevel {
  if (!Number.isFinite(score)) return "below_c";
  if (score >= 70) return "A+";
  if (score >= 65) return "A";
  if (score >= 60) return "B+";
  if (score >= 55) return "B";
  if (score >= 50) return "C+";
  if (score >= 46) return "C";
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
