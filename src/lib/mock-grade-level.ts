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
import { MOCK_SCALE_MAX } from "./rasch";

export type GradeLevel = "A+" | "A" | "B+" | "B" | "C+" | "C" | "below_c";

// Нижние границы полос, от верхней к нижней. ЕДИНСТВЕННЫЙ источник порогов:
// и gradeLevelFromScore, и проверка пограничности ниже читают этот список.
// Двумя списками их держать нельзя — разъедутся, и буква начнёт расходиться с
// баллом у границы, то есть там, где цена ошибки максимальна.
const LEVEL_FLOORS: Array<readonly [GradeLevel, number]> = [
  ["A+", 70], ["A", 65], ["B+", 60], ["B", 55], ["C+", 50], ["C", 46],
];

// Шкала, НА КОТОРОЙ заданы пороги выше: 0–75, та же, что выдаёт raschThetaToT.
// Числа 46/50/55/60/65/70 взяты из Baholash_mezoni.pdf и осмысленны только на
// ней.
const LEVEL_FLOOR_SCALE = MOCK_SCALE_MAX;

/**
 * Те же пороги, приведённые к шкале показа.
 *
 * Балл ученику показывается из 100 у общеобразовательных предметов и из 75 у
 * английского (см. certificateMaxForSubject). Пороги при этом остаются одними
 * и теми же по смыслу, поэтому масштабируются пропорционально:
 *
 *   из 75:   C 46    C+ 50    B 55    B+ 60    A 65    A+ 70
 *   из 100:  C 61.3  C+ 66.7  B 73.3  B+ 80    A 86.7  A+ 93.3
 *
 * ═══ ПОЧЕМУ НЕ ДВА СПИСКА ═══
 *
 * Соблазн — выписать сотенные пороги рядом константами. Нельзя: тогда
 * официальные числа перестают быть единственным источником, и правка нормы
 * (а её задаёт государство, не мы) потребует менять два места. Разъедутся они
 * у границы полосы, то есть там, где цена ошибки максимальна.
 *
 * ═══ ЧТО ЭТО НЕ МЕНЯЕТ ═══
 *
 * Букву. Умножение и балла, и порогов на одно и то же число монотонно,
 * поэтому уровень выходит тот же, на какой шкале ни считай. Проверено тестом
 * на всех порогах и вокруг них.
 */
export function levelFloorsFor(max: number = LEVEL_FLOOR_SCALE): Array<readonly [GradeLevel, number]> {
  if (!Number.isFinite(max) || max <= 0 || max === LEVEL_FLOOR_SCALE) return LEVEL_FLOORS;
  // Порядок действий тот же, что в tScoreToCertificateExact: сначала деление
  // на шкалу, потом умножение на максимум. Не «floor × (max/75)».
  //
  // Разница не косметическая. Балл считается как (t / 75) × max, и на самом
  // пороге два разных порядка действий расходятся в последнем бите двоичной
  // дроби: 55 × (100/75) не равно (55/75) × 100. Ученик ровно на границе
  // полосы получал из-за этого не ту букву — поймано тестом level-scale.
  return LEVEL_FLOORS.map(([level, floor]) => [level, (floor / LEVEL_FLOOR_SCALE) * max] as const);
}

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
// Округление до сотых осталось только на ПОКАЗ балла (roundScore,
// src/lib/certificate-scale.ts). Порядок жёсткий: сначала полоса по точному
// значению, потом округление для отображения — не наоборот.
/**
 * Шкала показа, на которой пришёл балл.
 *
 * ═══ ПОЧЕМУ ОБЪЕКТ, А НЕ ВТОРОЕ ЧИСЛО ═══
 *
 * Первая версия принимала `max: number` вторым позиционным аргументом — и
 * тут же нашёлся вызов `tScores.map(gradeLevelFromScore)`. Array.map передаёт
 * коллбэку ИНДЕКС вторым аргументом, тот попадал в max, и на элементе с
 * индексом 1 пороги делились на 75: все баллы становились A+. TypeScript
 * молчал, потому что индекс — тоже number.
 *
 * С объектом такой вызов перестаёт компилироваться: число не присваивается
 * типу опций. Функция решает, какую букву увидит ученик в сертификате, и
 * ошибка в ней не должна зависеть от того, заметил ли кто-то лишний аргумент.
 */
export type LevelScale = { max?: number };

export function gradeLevelFromScore(score: number, scale?: LevelScale): GradeLevel {
  if (!Number.isFinite(score)) return "below_c";
  for (const [level, floor] of levelFloorsFor(scale?.max)) {
    if (score >= floor) return level;
  }
  return "below_c";
}

// Уровни, которые накрывает доверительный интервал балла (ТЗ L.5).
//
// Пороги — не точки, а границы решения, и у границы цена ошибки максимальна.
// При SE ±3,2 балла ученик с 45,2 может по-настоящему быть и «Ниже C», и «C»:
// интервал 39,0–51,4 накрывает обе полосы и ещё C+. Показать это честнее, чем
// объявить уровень так, будто он измерен точно.
//
// Возвращает список от нижнего уровня к верхнему. Один элемент — уровень
// определён уверенно. null — погрешности нет, судить не о чем (§233: не
// выдумывать её вместо отсутствующей).
export function levelsWithinInterval(
  interval: { low: number; high: number } | null,
  scale?: LevelScale,
): GradeLevel[] | null {
  if (!interval) return null;
  const lowLevel = gradeLevelFromScore(interval.low, scale);
  const highLevel = gradeLevelFromScore(interval.high, scale);
  if (lowLevel === highLevel) return [lowLevel];

  const levels: GradeLevel[] = ["below_c"];
  for (let i = LEVEL_FLOORS.length - 1; i >= 0; i--) levels.push(LEVEL_FLOORS[i][0]);
  const from = levels.indexOf(lowLevel);
  const to = levels.indexOf(highLevel);
  return levels.slice(from, to + 1);
}

/**
 * Сколько баллов не хватает до следующего уровня (§R.7 — «сколько до
 * следующего уровня» в отчёте ученику).
 *
 * Считается от ТОЧНОГО балла, а не от показанного: показ округлён до сотых,
 * и «не хватает 0,0» выглядело бы издевательством у того, кому не хватает
 * четырёх сотых.
 *
 * null у A+: выше уровня нет, и показывать там «до следующего» нечего.
 */
export function pointsToNextLevel(
  score: number,
  scale?: LevelScale,
): { nextLevel: GradeLevel; pointsNeeded: number } | null {
  if (!Number.isFinite(score)) return null;
  // Полосы идут сверху вниз, поэтому ближайшая цель — последняя граница,
  // которая ещё выше текущего балла.
  let target: readonly [GradeLevel, number] | null = null;
  for (const floor of levelFloorsFor(scale?.max)) {
    if (floor[1] > score) target = floor;
  }
  if (!target) return null;
  return { nextLevel: target[0], pointsNeeded: target[1] - score };
}

/**
 * Помещается ли этот разрыв в погрешность измерения (§D.7, §L.5).
 *
 * Нужно, чтобы не обещать ученику лишнего. При SE ±3,2 балла «до C не хватает
 * 1,4» означает не «почти дотянул», а «мы не можем отличить тебя от того, кто
 * уже дотянул». Показывать первое как факт — обещать точность, которой нет.
 */
export function gapIsWithinError(pointsNeeded: number, scoreSe: number | null | undefined, z = 1.96): boolean {
  if (scoreSe === null || scoreSe === undefined || !Number.isFinite(scoreSe) || scoreSe <= 0) return false;
  return pointsNeeded <= z * scoreSe;
}

export function levelIsBorderline(
  interval: { low: number; high: number } | null,
  scale?: LevelScale,
): boolean {
  const levels = levelsWithinInterval(interval, scale);
  return levels !== null && levels.length > 1;
}

// "A+".."C" are already language-neutral letter badges, shown as-is
// everywhere — only "below_c" needs an actual localized label ("Ниже C" /
// "C dan past").
//
// Одна точка на всё: отсюда метка идёт и на экраны, и в выгрузку Excel
// (buildResultsSheet зовёт gradeLevelDisplay). Своя копия строки в экспорте
// однажды разошлась бы с показанной ученику.
//
// По-узбекски именно «past», а не «quyi»: «quyi» это «нижний» как положение
// (quyi qism — нижняя часть), а про уровень ниже порога говорят «past».
const BELOW_C_LABEL: Record<"ru" | "uz", string> = {
  ru: "Ниже C",
  uz: "C dan past",
};

export function gradeLevelDisplay(level: GradeLevel, locale: "ru" | "uz"): string {
  return level === "below_c" ? BELOW_C_LABEL[locale] : level;
}
