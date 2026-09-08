import { MOCK_SCALE_MAX } from "./rasch";

// Итоговый балл сертификата.
//
// ОДНА ШКАЛА НА ВСЕ ПРЕДМЕТЫ: 0–75, та самая, что даёт модель Раша
// (T = 50 + 10Z, Baholash_mezoni.pdf стр. 1; ТЗ §0.3 — «максимум 75, не 100»).
// Решение владельца от 2026-09-08: «макс 75 во всех предметах».
//
// Раньше общеобразовательные предметы выдавались из 100, а иностранные языки —
// из 75. Это ломалось об уровни: пороги 70/65/60/55/50/46 заданы на T-шкале, а
// буква считается от T, поэтому на сотенной шкале границы уезжали и на проде
// это выглядело нелепо —
//
//   77.2 из 100 → B          (T = 57.9)
//   63.0 из 100 → C          (T = 47.3)
//   60.3 из 100 → «Ниже C»   (T = 45.2)
//
// то есть шестьдесят баллов из ста означало «сертификата нет». На 75-балльной
// шкале балл и порог наконец одно и то же число: 47.3 → C, потому что C
// начинается с 46.
//
// Заодно исчез §237 (NO CROSS-SCALE MIXING): пока шкал было две, средние по
// группе приходилось считать в процентах, и «средний балл» был процентом, а не
// баллом. Теперь усреднять можно сами баллы.
//
// Не путать с блоками ПОСТУПЛЕНИЯ (93 и 63 балла, стр. 2 документа,
// «tabaqalashtirilgan ballar»): там своя арифметика Ball × 93/65, и она не про
// балл сертификата. Именно из-за этой таблицы сотенная шкала когда-то и
// появилась.
export const CERTIFICATE_MAX = MOCK_SCALE_MAX;

// ЕДИНСТВЕННОЕ место, где балл округляется.
//
// Раньше округление стояло трижды: в raschThetaToT (θ → T), в
// combineSectionScores (среднее разделов) и здесь. Каждое срезало точность
// независимо, и по методике Агентства балл выходил целым — 56, 68 — тогда как
// в сертификате у него есть десятая. Теперь первые два шага считают точно, а
// округление осталось одно, последнее.
//
// Один знак, а не два: столько же держит cefr_score
// (/api/mock-tests/[id]/cefr-recalculate) и столько же отдаёт
// get_my_class_subject_ranking (миграция 081). Третьей точности в проекте
// быть не должно.
export const SCORE_DECIMALS = 1;

export function roundScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

// Балл для показа. Печатать его сырым нельзя: 86.4 в double хранится неточно,
// и на экран вылезало бы «86.40000000000001».
//
// Запятая, а не точка. Так в ru/uz, и так же это важно для выгрузки: колонки в
// CSV разделены `;`, поэтому запятая внутри числа таблицу не ломает, зато Excel
// с русской локалью читает «67,8» как ЧИСЛО, а «67.8» — как текст, и среднее по
// колонке посчитать бы не вышло.
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return "";
  return score.toFixed(SCORE_DECIMALS).replace(".", ",");
}

// Предмет остаётся в сигнатуре, хотя ответ сейчас один для всех. Это не
// забытый аргумент: §L.1 требует свою трансформацию θ → балл НА ПРЕДМЕТ, а
// §R.3 велит оценивать её линкингом с настоящими сертификатами — по 100–150
// учеников на предмет. То есть шкала почти наверняка снова станет предметной,
// и тогда правка будет здесь одной, а не по всем вызовам.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function certificateMaxForSubject(subjectId: string | null | undefined): number {
  return CERTIFICATE_MAX;
}

// Перевод T-балла в балл сертификата. Шкалы теперь совпадают, поэтому функция
// осталась только затвором: зажать в границы и округлить один раз.
//
// Не выкинута, потому что это единственное место, через которое балл попадает
// в базу, и §R.3 вернёт сюда `A·θ + B` — тогда правка будет здесь.
export function tScoreToCertificate(tScore: number, subjectId: string | null | undefined): number {
  const max = certificateMaxForSubject(subjectId);
  if (!Number.isFinite(tScore)) return 0;
  const clamped = Math.max(0, Math.min(MOCK_SCALE_MAX, tScore));
  return roundScore((clamped / MOCK_SCALE_MAX) * max);
}

// Доля от максимума — ТОЛЬКО для цветовой заливки бейджа, где нужен процент.
// Для усреднения не годится: среднее процентов — процент, а не балл, и рядом
// с баллами из 75 читалось бы как завышенный балл. Усреднять — через
// `averageCertificateScore` ниже.
export function certificatePercent(score: number | null, max: number | null): number | null {
  if (score === null || max === null || !Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return null;
  return (score / max) * 100;
}

// Балл работы, приведённый к общей шкале 75.
//
// Сейчас все работы уже из 75, и приведение ничего не меняет. Нужно оно для
// строк, у которых в базе остался прежний максимум 100: пока миграция 092 не
// прошла или пока кеш отдаёт старую строку, среднее не должно скакать.
export function scoreOnCertificateScale(score: number | null, max: number | null): number | null {
  if (score === null || max === null || !Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return null;
  return (score / max) * CERTIFICATE_MAX;
}

// Средний балл по нескольким работам — группы, учителя, филиала.
//
// Возвращает БАЛЛ по шкале 75, а не процент. Раньше возвращался именно
// процент: шкал было две (75 и 100), складывать их напрямую было нельзя, и
// каждую работу приводили к сотне. Совпадало это с баллом только у
// общеобразовательных, а у английского «средний балл» выходил завышенным —
// 60 из 75 давало 80. Теперь шкала одна, и приводить не к чему.
//
// Работы без посчитанного балла в среднее не входят: их не с чем сравнивать,
// а ноль вместо них занизил бы результат группы.
export function averageCertificateScore(
  results: Array<{ score: number | null; max: number | null }>,
): number | null {
  const normalized = results
    .map((r) => scoreOnCertificateScale(r.score, r.max))
    .filter((v): v is number => v !== null);
  if (normalized.length === 0) return null;
  return roundScore(normalized.reduce((a, b) => a + b, 0) / normalized.length);
}
