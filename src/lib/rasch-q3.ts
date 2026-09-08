// Локальная независимость и размерность. ТЗ модуль G — §G.1–G.4
// (= разделы 50–53, 56, 57), плюс §222 (не удалять до решения).
//
// ═══ ЗАЧЕМ ═══
//
// §G.1: при фиксированной способности ответы на разные задания должны быть
// независимы. Нарушение завышает надёжность и смещает сложности — тест
// выглядит точнее, чем есть.
//
// У нас это не теория. В обоих реальных вариантах есть testlet-группы —
// вопросы к одному тексту, помеченные `group_key`: 11 групп в математике и 9 в
// узбекском. Модель считает их независимыми, то есть каждый вопрос к тексту
// приносит полную единицу информации, хотя понимание текста они делят. Именно
// там зависимость и ожидается.
//
// ═══ YEN Q3 (§G.2 = разделы 51–53) ═══
//
//   Q3(i,j) = corr(residual_i, residual_j)   по персонам, ответившим на ОБА
//
// Остаток модели: residual = X − P(θ, b). Если задания независимы, остатки не
// коррелируют — вся общая часть уже объяснена способностью.
//
// БАЗОВЫЙ УРОВЕНЬ. Q3 не центрирован в нуле: остатки связаны через саму оценку
// θ, и при полной независимости ожидаемая корреляция равна примерно
//
//   baseline ≈ −1 / (L − 1)
//
// На 55 заданиях это −0.0185, на 49 — −0.0208. Сравнивать Q3 с нулём значило
// бы систематически недооценивать зависимость.
//
// ВАЖНО, ГДЕ ЭТО ВЕРНО. Базовый уровень возникает именно потому, что θ
// ОЦЕНИВАЕТСЯ по тем же ответам: оценка «съедает» часть общей дисперсии, и
// остатки получаются слегка антикоррелированными. Если подать сюда ИСТИННЫЕ
// параметры (в симуляции), остатки ничем не связаны, Q3 ≈ 0, и вычитание
// базового уровня даёт ложное превышение ровно 1/(L−1). Первая версия теста на
// это и попалась. Значит вызывать модуль надо с оценёнными θ и b — теми же,
// по которым считался балл.
//
// ПОРОГ. Флаг при превышении базового уровня на 0.2 и более — Q3_EXCESS_THRESHOLD
// ниже. Порог вынесен в константу, потому что он решает, какие пары попадут
// методисту на разбор, и подбирать его в коде нельзя.
//
// Спека пишет «|Q3| выше базового уровня на 0.2 и более». Буквально это
// неоднозначно: baseline отрицателен, поэтому |Q3| − baseline положительно
// всегда. Реализовано так, как принято и как имеет смысл: основной флаг — на
// ПОЛОЖИТЕЛЬНОЕ превышение (задания делят что-то помимо способности), плюс
// отдельный, более редкий флаг на сильное отклонение ВНИЗ (остатки
// антикоррелируют — тоже нарушение независимости, но другой природы).
//
// ЧТО ЗНАЧИТ БОЛЬШОЕ ЧИСЛО ФЛАГОВ. θ оценивается по ВСЕМ заданиям, включая
// зависимые, поэтому сильный testlet искажает саму оценку и наводит ложные
// корреляции остатков между независимыми заданиями. Измерено на симуляции: при
// общем факторе ±2 логиты помечаются 9 пар и все внутри группы, а при ±4 —
// 61 пара, из которых внутри группы всего 10. То есть если флагов вдруг много,
// первая гипотеза — испорчена калибровка, а не «половина теста зависима».
//
// ═══ ЧЕГО ЗДЕСЬ НЕТ ═══
//
// Удаления заданий. §222 требует прямо: пометить Q3-флагом ДО решения. Ни одна
// функция модуля ничего не исключает — она возвращает список пар и флаги.

/** Превышение базового уровня, при котором пара помечается зависимой. */
export const Q3_EXCESS_THRESHOLD = 0.2;

/** Собственное значение первого контраста, при котором подозревается вторая размерность (§G.4). */
export const PCA_EIGENVALUE_THRESHOLD = 2.0;

/**
 * Минимум персон в паре. Корреляция по трём точкам — это шум: при N = 3 её
 * стандартная ошибка близка к единице, и любой флаг был бы о жеребьёвке.
 */
export const Q3_MIN_PERSONS = 10;

/** Матрица остатков: строки — персоны, столбцы — задания. null = не отвечал. */
export type ResidualMatrix = Array<Array<number | null>>;

const probability = (theta: number, difficulty: number): number => {
    const x = theta - difficulty;
    if (x >= 0) {
        const e = Math.exp(-x);
        return 1 / (1 + e);
    }
    const e = Math.exp(x);
    return e / (1 + e);
};

/**
 * Остатки модели X − P(θ, b) по матрице ответов.
 *
 * θ и сложности берутся ГОТОВЫМИ и не пересчитываются: оценка и диагностика —
 * разные шаги, и модуль G ничего в измерении не меняет.
 */
export function modelResiduals(
    responses: ReadonlyArray<ReadonlyArray<0 | 1 | null>>,
    thetas: ReadonlyArray<number>,
    difficulties: ReadonlyArray<number>,
): ResidualMatrix {
    return responses.map((row, person) =>
        row.map((answer, item) => {
            if (answer === null) return null;
            const theta = thetas[person];
            const difficulty = difficulties[item];
            if (!Number.isFinite(theta) || !Number.isFinite(difficulty)) return null;
            return answer - probability(theta, difficulty);
        }),
    );
}

/**
 * Стандартизованные остатки z = (X − P)/√(P(1−P)) — вход для PCA (§G.4).
 *
 * PCA считается именно по стандартизованным, а не по сырым: у сырых остатков
 * дисперсия зависит от того, насколько задание подходит ученику, и первый
 * контраст ловил бы это, а не вторую размерность.
 */
export function standardizedResiduals(
    responses: ReadonlyArray<ReadonlyArray<0 | 1 | null>>,
    thetas: ReadonlyArray<number>,
    difficulties: ReadonlyArray<number>,
): ResidualMatrix {
    return responses.map((row, person) =>
        row.map((answer, item) => {
            if (answer === null) return null;
            const theta = thetas[person];
            const difficulty = difficulties[item];
            if (!Number.isFinite(theta) || !Number.isFinite(difficulty)) return null;
            const p = probability(theta, difficulty);
            const w = p * (1 - p);
            if (w < 1e-10) return null;
            return (answer - p) / Math.sqrt(w);
        }),
    );
}

/** Базовый уровень Q3 при полной независимости: −1/(L−1). */
export function q3Baseline(itemCount: number): number {
    if (itemCount < 2) return 0;
    return -1 / (itemCount - 1);
}

export type Q3Flag =
    /** Остатки коррелируют сильнее базового уровня: задания делят что-то помимо способности. */
    | "DEPENDENT"
    /** Остатки антикоррелируют заметно ниже базового уровня — тоже нарушение независимости. */
    | "NEGATIVE_DEPENDENCE"
    /** Персон в паре меньше Q3_MIN_PERSONS: судить не о чем. */
    | "TOO_FEW_PERSONS";

export type Q3Pair = {
    itemA: number;
    itemB: number;
    /** Корреляция остатков. null — считать нечего (мало персон или нулевая дисперсия). */
    q3: number | null;
    /** Q3 минус базовый уровень. Именно это сравнивается с порогом. */
    excess: number | null;
    /** Сколько персон ответили на оба задания. */
    persons: number;
    /** Задания из одной testlet-группы (общий group_key). */
    sameGroup: boolean;
    flags: Q3Flag[];
};

/** Корреляция Пирсона по персонам, у которых есть оба остатка. */
function pairCorrelation(
    residuals: ResidualMatrix,
    itemA: number,
    itemB: number,
): { r: number | null; persons: number } {
    let n = 0;
    let sumA = 0;
    let sumB = 0;
    for (const row of residuals) {
        const a = row[itemA];
        const b = row[itemB];
        if (a === null || b === null || a === undefined || b === undefined) continue;
        n++;
        sumA += a;
        sumB += b;
    }
    if (n < 2) return { r: null, persons: n };
    const meanA = sumA / n;
    const meanB = sumB / n;
    let cov = 0;
    let varA = 0;
    let varB = 0;
    for (const row of residuals) {
        const a = row[itemA];
        const b = row[itemB];
        if (a === null || b === null || a === undefined || b === undefined) continue;
        const da = a - meanA;
        const db = b - meanB;
        cov += da * db;
        varA += da * da;
        varB += db * db;
    }
    // Нулевая дисперсия остатков по одному из заданий: корреляции не
    // существует, и возвращать ноль значило бы выдать «независимы» за факт.
    if (varA <= 0 || varB <= 0) return { r: null, persons: n };
    return { r: cov / Math.sqrt(varA * varB), persons: n };
}

export type Q3Analysis = {
    itemCount: number;
    baseline: number;
    threshold: number;
    /** Все пары, у которых Q3 удалось посчитать. */
    pairs: Q3Pair[];
    /** Только помеченные — то, что идёт методисту (§222). */
    flaggedPairs: Q3Pair[];
    /** Сводка: максимум и среднее превышения по всем посчитанным парам. */
    maxExcess: number | null;
    meanExcess: number | null;
    /** Сколько помеченных пар оказались внутри одной testlet-группы. */
    flaggedWithinGroup: number;
    /** Сколько пар внутри групп было проверено — знаменатель к предыдущему. */
    withinGroupPairs: number;
};

/**
 * Q3 по всем парам заданий (§G.2).
 *
 * `groupKeys` — testlet-метки заданий (`mock_questions.group_key`). Нужны не
 * для расчёта, а для интерпретации: зависимость внутри группы вопросов к одному
 * тексту ожидаема и объяснима, а между несвязанными заданиями — повод искать
 * дублирование или подсказку.
 *
 * Ни одно задание не исключается: §222 требует пометить и оставить решение
 * человеку.
 */
export function q3Analysis(
    residuals: ResidualMatrix,
    opts: { groupKeys?: ReadonlyArray<string | null>; threshold?: number } = {},
): Q3Analysis {
    const itemCount = residuals[0]?.length ?? 0;
    const baseline = q3Baseline(itemCount);
    const threshold = opts.threshold ?? Q3_EXCESS_THRESHOLD;
    const groupKeys = opts.groupKeys;

    const pairs: Q3Pair[] = [];
    let withinGroupPairs = 0;

    for (let i = 0; i < itemCount; i++) {
        for (let j = i + 1; j < itemCount; j++) {
            const { r, persons } = pairCorrelation(residuals, i, j);
            const keyA = groupKeys?.[i] ?? null;
            const keyB = groupKeys?.[j] ?? null;
            const sameGroup = keyA !== null && keyA === keyB;
            if (sameGroup) withinGroupPairs++;

            const flags: Q3Flag[] = [];
            const excess = r === null ? null : r - baseline;

            if (persons < Q3_MIN_PERSONS) {
                flags.push("TOO_FEW_PERSONS");
            } else if (excess !== null) {
                if (excess >= threshold) flags.push("DEPENDENT");
                else if (excess <= -threshold) flags.push("NEGATIVE_DEPENDENCE");
            }

            pairs.push({ itemA: i, itemB: j, q3: r, excess, persons, sameGroup, flags });
        }
    }

    const measured = pairs.filter((p) => p.excess !== null).map((p) => p.excess as number);
    const flaggedPairs = pairs.filter(
        (p) => p.flags.includes("DEPENDENT") || p.flags.includes("NEGATIVE_DEPENDENCE"),
    );
    // Сортировка по убыванию превышения: самая сильная зависимость — первой,
    // потому что именно её методист смотрит в первую очередь.
    flaggedPairs.sort((a, b) => (b.excess ?? 0) - (a.excess ?? 0));

    return {
        itemCount,
        baseline,
        threshold,
        pairs,
        flaggedPairs,
        maxExcess: measured.length ? Math.max(...measured) : null,
        meanExcess: measured.length ? measured.reduce((a, b) => a + b, 0) / measured.length : null,
        flaggedWithinGroup: flaggedPairs.filter((p) => p.sameGroup).length,
        withinGroupPairs,
    };
}

// ═══ Residual PCA (§G.3–G.4) ═══

export type PcaResult = {
    /** Собственные значения первых контрастов, по убыванию. */
    eigenvalues: number[];
    /** Сумма всех собственных значений равна числу заданий у корреляционной матрицы. */
    itemCount: number;
    /** Первый контраст ≥ порога — подозрение на вторую размерность. */
    flagged: boolean;
    threshold: number;
};

/**
 * Корреляционная матрица стандартизованных остатков по заданиям.
 * Пары считаются по персонам, у которых есть оба остатка.
 */
function residualCorrelationMatrix(residuals: ResidualMatrix, itemCount: number): number[][] {
    const matrix: number[][] = Array.from({ length: itemCount }, () => new Array(itemCount).fill(0));
    for (let i = 0; i < itemCount; i++) {
        matrix[i][i] = 1;
        for (let j = i + 1; j < itemCount; j++) {
            const { r } = pairCorrelation(residuals, i, j);
            // Непосчитанную корреляцию считаем нулём ТОЛЬКО здесь и осознанно:
            // матрица должна остаться симметричной и полной, иначе разложение
            // не определено. Пропуск как «нет связи» — самое консервативное
            // допущение: оно занижает контраст, а не завышает.
            const value = r === null ? 0 : r;
            matrix[i][j] = value;
            matrix[j][i] = value;
        }
    }
    return matrix;
}

/**
 * Первые собственные значения матрицы остатков (§G.4).
 *
 * Метод — степенные итерации с дефляцией: нужны только несколько наибольших
 * значений, а не полное разложение матрицы 55×55. Детерминирован (§O.4):
 * стартовый вектор задан формулой, а не ГПСЧ, поэтому один вход всегда даёт
 * один результат.
 *
 * §G.4: если первый контраст имеет собственное значение ≥ 2.0, это подозрение
 * на вторую размерность — тест меряет не одно. Флаг, а не вывод: разбирать
 * надо содержательно.
 */
export function residualPca(
    residuals: ResidualMatrix,
    opts: { contrasts?: number; threshold?: number; iterations?: number } = {},
): PcaResult {
    const itemCount = residuals[0]?.length ?? 0;
    const contrasts = opts.contrasts ?? 3;
    const threshold = opts.threshold ?? PCA_EIGENVALUE_THRESHOLD;
    const iterations = opts.iterations ?? 500;

    if (itemCount < 2) {
        return { eigenvalues: [], itemCount, flagged: false, threshold };
    }

    const matrix = residualCorrelationMatrix(residuals, itemCount);
    const eigenvalues: number[] = [];

    for (let c = 0; c < Math.min(contrasts, itemCount); c++) {
        // Стартовый вектор детерминирован и не выровнен ни с одной осью:
        // cos(i) не даёт ни постоянного вектора, ни ортогональности к
        // искомому направлению по случайности.
        let v = Array.from({ length: itemCount }, (_, i) => Math.cos(i + 1));
        let norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
        v = v.map((x) => x / norm);
        let eigenvalue = 0;

        for (let it = 0; it < iterations; it++) {
            const next = new Array(itemCount).fill(0);
            for (let i = 0; i < itemCount; i++) {
                let sum = 0;
                for (let j = 0; j < itemCount; j++) sum += matrix[i][j] * v[j];
                next[i] = sum;
            }
            norm = Math.sqrt(next.reduce((a, x) => a + x * x, 0));
            if (!(norm > 1e-12)) break;
            const normalized = next.map((x) => x / norm);
            // Рэлеевское отношение: vᵀAv при единичной норме v.
            let rayleigh = 0;
            for (let i = 0; i < itemCount; i++) rayleigh += normalized[i] * next[i];
            const converged = Math.abs(rayleigh - eigenvalue) < 1e-10;
            eigenvalue = rayleigh;
            v = normalized;
            if (converged) break;
        }

        eigenvalues.push(eigenvalue);

        // Дефляция: вычитаем найденное направление, чтобы следующая итерация
        // нашла следующий по величине контраст.
        for (let i = 0; i < itemCount; i++) {
            for (let j = 0; j < itemCount; j++) {
                matrix[i][j] -= eigenvalue * v[i] * v[j];
            }
        }
    }

    return {
        eigenvalues,
        itemCount,
        flagged: eigenvalues.length > 0 && eigenvalues[0] >= threshold,
        threshold,
    };
}
