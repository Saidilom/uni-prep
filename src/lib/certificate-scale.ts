import { MOCK_SCALE_MAX } from "./rasch";

// Итоговый балл сертификата.
//
// Шкала Раша даёт T = 50 + 10Z с потолком 75 (Baholash_mezoni.pdf, стр. 1).
// Это ПРОМЕЖУТОЧНАЯ величина: в сертификат БМБА и для поступления балл
// выдаётся по шкале предмета.
//
//   Иностранные языки (Multilevel) — 75, шкала совпадает с T.
//   Все общеобразовательные — 100: математика, физика, химия, биология,
//   история, география, родной язык и литература, юриспруденция.
//
// Уровень A+..C при этом считается по-прежнему от T, а не от итогового балла:
// пороги 70/65/60/55/50/46 в документе заданы именно на T-шкале. Считать букву
// от 100-балльного числа значило бы сдвинуть все границы.
export const CERTIFICATE_MAX_ENGLISH = MOCK_SCALE_MAX;
export const CERTIFICATE_MAX_GENERAL = 100;

// Multilevel — это про иностранные языки. Отдельный список, а не сравнение с
// одним 'english', чтобы добавление немецкого или французского было правкой в
// одну строку, а не поиском по проекту.
const FOREIGN_LANGUAGE_SUBJECTS = new Set(["english"]);

export function certificateMaxForSubject(subjectId: string | null | undefined): number {
  return subjectId !== null && subjectId !== undefined && FOREIGN_LANGUAGE_SUBJECTS.has(subjectId)
    ? CERTIFICATE_MAX_ENGLISH
    : CERTIFICATE_MAX_GENERAL;
}

// Перевод T-балла в балл сертификата — пропорция шкалы Раша.
//
// Не путать с таблицей «tabaqalashtirilgan ballar» со стр. 2 документа
// (Ball × 93/65 и Ball × 63/65): та считает баллы за блоки ПОСТУПЛЕНИЯ, где
// максимумы 93 и 63, и по ней всякий, кто взял уровень A, получает ровно
// максимум. Для тренировочного мока это стёрло бы разницу между A и A+ —
// сильному ученику некуда было бы расти.
export function tScoreToCertificate(tScore: number, subjectId: string | null | undefined): number {
  const max = certificateMaxForSubject(subjectId);
  if (!Number.isFinite(tScore)) return 0;
  const clamped = Math.max(0, Math.min(MOCK_SCALE_MAX, tScore));
  return Math.round((clamped / MOCK_SCALE_MAX) * max);
}

// Доля от максимума предмета — для цветовой заливки бейджа. Балл английского
// из 75 и балл математики из 100 нельзя красить по одному и тому же числу:
// 60 у англичанина это 80%, а у математика 60%.
export function certificatePercent(score: number | null, max: number | null): number | null {
  if (score === null || max === null || !Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return null;
  return Math.round((score / max) * 100);
}

// Средний балл по нескольким работам — группы, учителя, филиала.
//
// Складывать баллы как есть нельзя: у английского потолок 75, у остальных
// предметов 100, и английская группа выглядела бы слабее любой другой просто
// из-за более низкой шкалы. Поэтому каждую работу сначала приводим к сотне
// (у общеобразовательных это ничего не меняет), и только потом усредняем.
//
// Работы без посчитанного балла в среднее не входят: их не с чем сравнивать,
// а ноль вместо них занизил бы результат группы.
export function averageCertificateScore(
  results: Array<{ score: number | null; max: number | null }>,
): number | null {
  const normalized = results
    .map((r) => certificatePercent(r.score, r.max))
    .filter((v): v is number => v !== null);
  if (normalized.length === 0) return null;
  return Math.round(normalized.reduce((a, b) => a + b, 0) / normalized.length);
}
