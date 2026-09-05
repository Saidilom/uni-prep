// Официальная методика Агентства по оценке знаний — Baholash_mezoni.pdf,
// «UMUMTA'LIM FANLARINI BILISH DARAJASINI ANIQLASH UCHUN BAHOLASH MEZONLARI».
// Чистая математика, без сети и БД. Оркестровка — /api/rasch/recalculate.
//
// Документ описывает два уровня:
//
//   1. Общий для всех предметов (стр. 1-2): Z = (θ − μ) / σ, T = 50 + 10Z,
//      максимум 75, уровни A+..C по порогам 70/65/60/55/50/46. Это уже
//      реализовано — raschThetaToT (src/lib/rasch.ts) и gradeLevelFromScore
//      (src/lib/mock-grade-level.ts), сверено с документом построчно.
//
//   2. Отдельный для родного языка (стр. 3-4): узбекский, русский и
//      каракалпакский язык и литература сдаются ДВУМЯ разделами —
//      «test topshiriqlari birinchi, yozma ish ikkinchi bo'lim sifatida
//      olinadi». Тест считается по Рашу, сочинение оценивается по критерию на
//      24 балла и переводится в 75-балльную шкалу таблицей ниже, после чего
//      берётся среднее арифметическое двух разделов. Это и реализует модуль.
//
// Английский идёт по своему документу (Multilevel-bm.pdf) — src/lib/english-cefr.ts.

// Предметы, для которых применима методика стр. 3-4. В проекте предмет группы
// берётся из CORE_SUBJECTS ('native'), предмет теста — из MOCK_SUBJECTS
// ('uzbek' / 'russian'); документ называет узбекский, русский и каракалпакский.
const NATIVE_CERT_SUBJECTS = new Set(["native", "uzbek", "russian", "karakalpak"]);

export function isNativeCertSubject(subjectId: string | null | undefined): boolean {
  return subjectId !== null && subjectId !== undefined && NATIVE_CERT_SUBJECTS.has(subjectId);
}

// Таблица перевода сочинения из 24-балльного критерия в 75-балльную шкалу.
// Перенесена из документа построчно (стр. 3-4). Внутри она строго линейна —
// 2·балл + 27 — и тест `native-cert.test.ts` это проверяет на каждой строке,
// чтобы опечатка при переносе не прошла незамеченной. Держим её всё же
// таблицей, а не формулой: сверять с бумагой построчно должно быть можно.
//
// Ноль стоит особняком: 0,5 → 28, но 0 → 0. Это не разрыв по недосмотру, так
// напечатано в документе — несданная работа не получает нижнюю границу шкалы.
const ESSAY24_TO_SCORE75: Array<readonly [number, number]> = [
  [0.5, 28], [1, 29], [1.5, 30], [2, 31], [2.5, 32], [3, 33], [3.5, 34], [4, 35],
  [4.5, 36], [5, 37], [5.5, 38], [6, 39], [6.5, 40], [7, 41], [7.5, 42], [8, 43],
  [8.5, 44], [9, 45], [9.5, 46], [10, 47], [10.5, 48], [11, 49], [11.5, 50], [12, 51],
  [12.5, 52], [13, 53], [13.5, 54], [14, 55], [14.5, 56], [15, 57], [15.5, 58], [16, 59],
  [16.5, 60], [17, 61], [17.5, 62], [18, 63], [18.5, 64], [19, 65], [19.5, 66], [20, 67],
  [20.5, 68], [21, 69], [21.5, 70], [22, 71], [22.5, 72], [23, 73], [23.5, 74], [24, 75],
];

// Перевод по 24-балльному критерию. Значения между строками таблицы округляются
// вверх до следующей — та же семантика, что у writingRawToScore для английского
// (src/lib/english-cefr.ts), чтобы две таблицы вели себя одинаково.
export function essay24ToScore75(points24: number): number {
  if (!Number.isFinite(points24) || points24 <= 0) return 0;
  for (const [threshold, score] of ESSAY24_TO_SCORE75) {
    if (points24 <= threshold) return score;
  }
  return 75;
}

// То же, но от «сколько набрал из скольких возможных».
//
// Приводить к 24 приходится, потому что не у всех тестов сочинение весит ровно
// 24: у моков, импортированных при старой самодельной шкале, максимум за эссе
// оказался 18,22 — след нормировки суммы теста под 75 (см. design/FIX.md,
// «Две шкалы 75»). Критерий в документе всегда 24-балльный, поэтому долю
// пересчитываем на него.
export function essayPointsToScore75(earnedPoints: number, maxPoints: number): number {
  if (!Number.isFinite(maxPoints) || maxPoints <= 0) return 0;
  const clamped = Math.max(0, Math.min(maxPoints, earnedPoints));
  return essay24ToScore75((clamped / maxPoints) * 24);
}

// «birinchi va ikkinchi bo'limlarning o'rtacha arifmetik qiymati umumiy ball
// sifatida qabul qilinadi» — итог есть среднее арифметическое разделов.
//
// Принимает только те разделы, которые в тесте реально есть: у теста без
// сочинения это один Rasch-балл, у теста из одного сочинения — один переводной.
// Пустой список даёт null, а не 0: «нечего усреднять» и «ноль баллов» это
// разные вещи, и ноль тут читался бы как реальный результат.
export function combineSectionScores(sectionScores: number[]): number | null {
  const usable = sectionScores.filter((s) => Number.isFinite(s));
  if (usable.length === 0) return null;
  const avg = usable.reduce((a, b) => a + b, 0) / usable.length;
  return Math.round(avg);
}
