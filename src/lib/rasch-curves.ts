// Психометрические кривые: TIF, TCC, ICC и карта Райта.
// ТЗ §D.3 (информация теста), §D.10 (карта Райта), §D.11 (TCC), §D.12 (ICC).
//
// ═══ ЧТО ЭТО ЗА ЧЕТЫРЕ КАРТИНКИ ═══
//
// Все четыре рисуются на ОДНОЙ оси — логитах θ. В этом их смысл: способность
// ученика и сложность задания живут в одной шкале, поэтому их можно положить
// рядом и увидеть, попадает ли тест туда, где сидят люди.
//
//   ICC  (§D.12) — по одному заданию: вероятность верного ответа как функция
//                  способности. Точка перегиба стоит ровно на b_i.
//   TCC  (§D.11) — по всему тесту: ожидаемый СЫРОЙ балл как функция θ. Это та
//                  самая кривая, которая объясняет, почему шкала сырых баллов
//                  нелинейна: в середине один верный ответ стоит меньше логит,
//                  чем на краях.
//   TIF  (§D.3)  — точность: I(θ) = Σ I_i(θ). Где выше, там SE = 1/√I ниже.
//   Карта Райта  — где стоят ученики и где стоят задания, бок о бок.
//
// ═══ ГЛАВНОЕ, ЧТО ОНИ ПОКАЗЫВАЮТ ═══
//
// Рассогласование нацеливания (§D.9). Тест точнее всего там, где сгущены
// сложности заданий. Если когорта сидит не там, точность тратится впустую:
// формально тест хороший, а конкретную группу он меряет грубо. Это ровно то,
// что видно на нашем моке и чего не видно ни по одному числу в отчёте.
//
// ═══ ЧЕГО ЗДЕСЬ НЕТ ═══
//
// Модели. Ни оценки θ, ни калибровки, ни шкалы: вероятность берётся у
// `probability` из rasch.ts, информация — у `itemInformation`/`testInformation`
// оттуда же. Этот модуль только раскладывает уже существующие функции по сетке
// значений θ. Ни один балл от него не зависит.

import { probability3pl, itemInformation3pl, testInformation3pl, type Item3pl } from "./irt-3pl";

/** Границы сетки по умолчанию, если распределений не дали. */
export const DEFAULT_THETA_MIN = -4;
export const DEFAULT_THETA_MAX = 4;
/** Жёсткие пределы: за ±6 логит вероятности отличаются от 0 и 1 на 0.2%. */
export const THETA_LIMIT = 6;
/** Точек на кривой. 161 на диапазоне 8 логит — шаг 0.05. */
export const CURVE_RESOLUTION = 161;

export type ThetaRange = { min: number; max: number };

/**
 * Диапазон оси, покрывающий и учеников, и задания.
 *
 * Фиксированные ±4 не годятся: на нашем моке сложности уходят за +3, а
 * когорта сидит около −1.5, и часть кривой оказалась бы за краем картинки —
 * ровно та часть, ради которой всё и рисуется.
 */
export function thetaRangeFor(
    abilities: readonly number[],
    difficulties: readonly number[],
    margin = 1,
): ThetaRange {
    const all = [...abilities, ...difficulties].filter(Number.isFinite);
    if (all.length === 0) return { min: DEFAULT_THETA_MIN, max: DEFAULT_THETA_MAX };
    const min = Math.max(-THETA_LIMIT, Math.min(...all) - margin);
    const max = Math.min(THETA_LIMIT, Math.max(...all) + margin);
    // Вырожденный случай: все меры совпали. Рисовать линию нулевой ширины
    // нельзя — деление на диапазон даст NaN в координатах.
    if (!(max > min)) return { min: min - 1, max: min + 1 };
    return { min, max };
}

function grid(range: ThetaRange, points = CURVE_RESOLUTION): number[] {
    const step = (range.max - range.min) / (points - 1);
    return Array.from({ length: points }, (_, i) => range.min + i * step);
}

// ═══════════════════════ ICC (§D.12) ═══════════════════════

export type IccCurve = {
    difficulty: number;
    points: Array<{ theta: number; probability: number }>;
};

/**
 * Кривая одного задания: P_i(θ).
 *
 * ═══ ЧТО ИЗМЕНИЛОСЬ С ПЕРЕХОДОМ НА 3PL ═══
 *
 * Раньше здесь стояла формула Раша, и у всех кривых был ОДИНАКОВЫЙ наклон —
 * в этом и состояла модель. Теперь наклон задаёт a, а нижняя асимптота — c:
 * кривые различаются не только сдвигом, и на графике это сразу видно.
 *
 * Заодно перестала действовать достаточность сырого балла (§B.6): у двух
 * учеников с одинаковым числом верных θ теперь РАЗНАЯ, потому что важно, какие
 * именно задания решены.
 */
export function buildIcc(item: Item3pl, range: ThetaRange, points = CURVE_RESOLUTION): IccCurve {
    return {
        difficulty: item.b,
        points: grid(range, points).map((theta) => ({
            theta,
            probability: probability3pl(theta, item),
        })),
    };
}

// ═══════════════════════ TCC (§D.11) ═══════════════════════

export type TccCurve = {
    itemCount: number;
    points: Array<{ theta: number; expectedScore: number }>;
};

/**
 * Ожидаемый сырой балл как функция способности: E(θ) = Σ_i P_i(θ).
 *
 * Это ТА ЖЕ функция, что стоит за таблицей «сырой балл → θ» (§R.6), только
 * прочитанная в обратную сторону. Её нелинейность и есть причина, по которой
 * переход с 10 на 15 верных стоит других логит, чем с 40 на 45.
 */
export function buildTcc(
    items: readonly Item3pl[],
    range: ThetaRange,
    points = CURVE_RESOLUTION,
): TccCurve {
    return {
        itemCount: items.length,
        points: grid(range, points).map((theta) => ({
            theta,
            expectedScore: items.reduce((sum, item) => sum + probability3pl(theta, item), 0),
        })),
    };
}

// ═══════════════════════ TIF (§D.3) и нацеливание (§D.9) ═══════════════════════

export type TifPoint = { theta: number; information: number; se: number | null };

export type CohortSummary = {
    count: number;
    mean: number;
    median: number;
    min: number;
    max: number;
};

export type TifCurve = {
    points: TifPoint[];
    /** Где тест точнее всего. Уточнён параболой, а не взят с узла сетки. */
    peak: { theta: number; information: number; se: number | null };
    /** Где сидит когорта. null — учеников не дали. */
    cohort: CohortSummary | null;
    /** Информация и SE в центре когорты. */
    atCohort: { theta: number; information: number; se: number | null } | null;
    /**
     * Рассогласование нацеливания (§D.9): на сколько логит центр когорты
     * отстоит от оптимума теста. Знак важен — минус значит «тест труднее, чем
     * нужно этой группе».
     */
    targetingGap: number | null;
    /**
     * Во сколько раз SE в центре когорты хуже, чем в оптимуме теста. 1.0 —
     * нацелен идеально. Это цена рассогласования в тех единицах, в которых
     * ученик её чувствует.
     */
    sePenalty: number | null;
};

const seFor = (information: number): number | null =>
    Number.isFinite(information) && information > 1e-9 ? 1 / Math.sqrt(information) : null;

function summarize(values: readonly number[]): CohortSummary | null {
    const finite = values.filter(Number.isFinite);
    if (finite.length === 0) return null;
    const sorted = [...finite].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return {
        count: sorted.length,
        mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
        median: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
        min: sorted[0],
        max: sorted[sorted.length - 1],
    };
}

/**
 * Кривая информации теста плюс разметка нацеливания.
 *
 * Пик ищется по сетке и уточняется параболой через три соседние точки.
 * Тернарный поиск был бы точнее на гладкой унимодальной функции, но I(θ)
 * унимодальной НЕ обязана быть: при двух сгустках сложностей у неё два горба,
 * и тернарный поиск сошёлся бы к ложной вершине. Локальная парабола такого
 * предположения не делает.
 */
export function buildTif(
    items: readonly Item3pl[],
    abilities: readonly number[],
    range: ThetaRange,
    points = CURVE_RESOLUTION,
): TifCurve {
    const usable = items.filter((item) => Number.isFinite(item.b) && Number.isFinite(item.a));
    const curve: TifPoint[] = grid(range, points).map((theta) => {
        const information = testInformation3pl(theta, usable);
        return { theta, information, se: seFor(information) };
    });

    let peakIndex = 0;
    curve.forEach((p, i) => { if (p.information > curve[peakIndex].information) peakIndex = i; });

    let peakTheta = curve[peakIndex].theta;
    let peakInfo = curve[peakIndex].information;
    // Парабола через три точки: вершина между узлами сетки, а не на узле.
    if (peakIndex > 0 && peakIndex < curve.length - 1) {
        const y0 = curve[peakIndex - 1].information;
        const y1 = curve[peakIndex].information;
        const y2 = curve[peakIndex + 1].information;
        const denom = y0 - 2 * y1 + y2;
        if (denom !== 0) {
            const shift = (0.5 * (y0 - y2)) / denom;
            // Смещение вершины не может выйти за соседний узел; если вышло,
            // значит три точки почти на одной прямой и уточнять нечего.
            if (Math.abs(shift) <= 1) {
                const step = curve[peakIndex + 1].theta - curve[peakIndex].theta;
                peakTheta = curve[peakIndex].theta + shift * step;
                peakInfo = testInformation3pl(peakTheta, usable);
            }
        }
    }

    const cohort = summarize(abilities);
    const atCohort = cohort === null ? null : (() => {
        const information = testInformation3pl(cohort.mean, usable);
        return { theta: cohort.mean, information, se: seFor(information) };
    })();

    const peakSe = seFor(peakInfo);
    return {
        points: curve,
        peak: { theta: peakTheta, information: peakInfo, se: peakSe },
        cohort,
        atCohort,
        targetingGap: cohort === null ? null : cohort.mean - peakTheta,
        sePenalty: peakSe !== null && atCohort?.se != null ? atCohort.se / peakSe : null,
    };
}

// ═══════════════════════ Карта Райта (§D.10) ═══════════════════════

export type WrightBin = {
    from: number;
    to: number;
    center: number;
    persons: number;
    items: number;
};

export type WrightMap = {
    bins: WrightBin[];
    binWidth: number;
    persons: CohortSummary | null;
    items: CohortSummary | null;
    /**
     * Доля учеников, чья способность попадает в диапазон сложностей заданий.
     * Меньше единицы — часть группы измеряется заданиями, которые ей не по
     * росту ни с той, ни с другой стороны.
     */
    coverage: number | null;
    /**
     * Полосы шириной в одну корзину, где есть ученики, но нет ни одного
     * задания. Классическая находка карты Райта: там измерять нечем.
     */
    gaps: Array<{ from: number; to: number; persons: number }>;
    /**
     * Задания труднее самого сильного ученика и легче самого слабого.
     *
     * Это САМЫЙ прямой счётчик нацеливания, и он честнее, чем потеря
     * точности в центре когорты. На нашей математике SE в центре хуже
     * оптимума всего в 1.10 раза — звучит безобидно, — но 13 заданий из 55
     * стоят выше, чем способность лучшего ученика в группе. Их не решил
     * никто и не мог решить: они не измеряют, а занимают время.
     *
     * Разница между этими двумя взглядами в том, что при 55 заданиях кривая
     * информации широкая и на сдвиг центра реагирует слабо, а вот отдельные
     * задания на краю выпадают из работы полностью.
     */
    itemsAbovePersons: number;
    itemsBelowPersons: number;
};

/**
 * Гистограммы способностей и сложностей на ОБЩЕЙ оси.
 *
 * Общая ось — весь смысл: обе величины в логитах и сравнимы напрямую. Две
 * отдельные гистограммы с разными пределами выглядели бы похоже и не сказали
 * бы ничего.
 */
export function buildWrightMap(
    abilities: readonly number[],
    difficulties: readonly number[],
    range: ThetaRange,
    binCount = 20,
): WrightMap {
    const persons = abilities.filter(Number.isFinite);
    const items = difficulties.filter(Number.isFinite);
    const binWidth = (range.max - range.min) / binCount;

    const bins: WrightBin[] = Array.from({ length: binCount }, (_, i) => ({
        from: range.min + i * binWidth,
        to: range.min + (i + 1) * binWidth,
        center: range.min + (i + 0.5) * binWidth,
        persons: 0,
        items: 0,
    }));

    const binOf = (value: number) =>
        // Последняя корзина включает правую границу, иначе максимальная мера
        // выпадала бы из карты.
        Math.min(binCount - 1, Math.max(0, Math.floor((value - range.min) / binWidth)));

    persons.forEach((theta) => { bins[binOf(theta)].persons++; });
    items.forEach((b) => { bins[binOf(b)].items++; });

    const itemStats = summarize(items);
    const coverage = itemStats === null || persons.length === 0
        ? null
        : persons.filter((t) => t >= itemStats.min && t <= itemStats.max).length / persons.length;

    const gaps = bins
        .filter((bin) => bin.persons > 0 && bin.items === 0)
        .map((bin) => ({ from: bin.from, to: bin.to, persons: bin.persons }));

    const personStats = summarize(persons);
    return {
        bins,
        binWidth,
        persons: personStats,
        items: itemStats,
        coverage,
        gaps,
        itemsAbovePersons: personStats === null ? 0 : items.filter((b) => b > personStats.max).length,
        itemsBelowPersons: personStats === null ? 0 : items.filter((b) => b < personStats.min).length,
    };
}

/** Информация одного задания по сетке — для подсветки вклада в TIF. */
export function buildItemInformationCurve(
    item: Item3pl,
    range: ThetaRange,
    points = CURVE_RESOLUTION,
): Array<{ theta: number; information: number }> {
    return grid(range, points).map((theta) => ({
        theta,
        information: itemInformation3pl(theta, item),
    }));
}
