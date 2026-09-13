// Калибровка заданий по 3PL: MMLE/EM с априорными распределениями.
//
// Этапы 2.3 и 2.5 разбора владельца. E-шаг — квадратура по θ (Bock & Aitkin,
// 1981), M-шаг — подъём по правдоподобию с аналитическими производными.
//
// ═══ ПОЧЕМУ АПРИОРНЫЕ РАСПРЕДЕЛЕНИЯ ОБЯЗАТЕЛЬНЫ ═══
//
// Чистый MMLE на нашей выборке не сходится, и это не вопрос вкуса:
//
//   * у задания, которое не решил НИКТО (на боевой математике таких 5 из 55),
//     правдоподобие монотонно по a и b — максимума нет вовсе;
//   * c определяется тем, как отвечают самые слабые; при 36 сдавших таких
//     наблюдений единицы, и оценка c гуляет по всему отрезку.
//
// Байесовская модальная оценка (Mislevy, 1986) закрывает оба случая: там, где
// данных нет, параметр остаётся у априорного центра, а не улетает. Центры и
// разбросы записываются рядом с оценками — §109 требует, чтобы метод был виден
// в данных, а не только в коде.

import { probability3pl, SCALING_D, type Item3pl } from "./irt-3pl";

/** Узлов квадратуры по θ. 40 на отрезке ±4σ — обычная практика для EM. */
const QUADRATURE_NODES = 40;
const QUADRATURE_BOUND = 4;

/** Границы параметров. За ними оценка перестаёт быть осмысленной. */
export const BOUNDS = {
    a: { min: 0.2, max: 3 },
    b: { min: -6, max: 6 },
    c: { min: 0, max: 0.5 },
} as const;

export type Priors = {
    /** Логнормальный для a: медиана 1, разброс в логарифме. */
    aLogSd: number;
    /** Нормальный для b. */
    bSd: number;
    /** Beta для c: концентрация вокруг центра 1/k. */
    cConcentration: number;
};

export const DEFAULT_PRIORS: Priors = { aLogSd: 0.5, bSd: 2, cConcentration: 20 };

export type CalibrationItemInput = {
    /** Ответы по этому заданию: 1, 0 или null, если задание не предъявлялось. */
    responses: ReadonlyArray<0 | 1 | null>;
    /**
     * Сколько вариантов ответа у задания. Центр априорного c равен 1/k.
     * null — задание со свободным ответом: угадывания нет, c закреплён нулём.
     */
    optionCount: number | null;
};

export type CalibratedItem = Item3pl & {
    /** Центр априорного распределения c, по которому оценка притянута. */
    cPrior: number;
    /** Сколько человек отвечали на это задание. */
    sampleSize: number;
    /** Сколько ответили верно. */
    correctCount: number;
    status: "OK" | "NONE_CORRECT" | "ALL_CORRECT" | "NO_RESPONSES" | "FIXED_GUESSING";
};

export type Calibration3plResult = {
    items: CalibratedItem[];
    /** Оценки θ каждого испытуемого на последнем E-шаге (апостериорное среднее). */
    abilities: number[];
    iterations: number;
    converged: boolean;
    priors: Priors;
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Узлы и веса квадратуры: равномерная сетка с весами N(0,1). */
function quadrature(): { nodes: number[]; weights: number[] } {
    const nodes: number[] = [];
    const raw: number[] = [];
    const step = (2 * QUADRATURE_BOUND) / (QUADRATURE_NODES - 1);
    for (let i = 0; i < QUADRATURE_NODES; i++) {
        const theta = -QUADRATURE_BOUND + i * step;
        nodes.push(theta);
        raw.push(Math.exp(-0.5 * theta * theta));
    }
    const total = raw.reduce((s, w) => s + w, 0);
    return { nodes, weights: raw.map((w) => w / total) };
}

/** Логарифм априорной плотности — добавляется к правдоподобию задания. */
function logPrior(item: Item3pl, cPrior: number, priors: Priors, fixedC: boolean): number {
    const logA = Math.log(item.a);
    let value = -logA - (logA * logA) / (2 * priors.aLogSd * priors.aLogSd);
    value += -(item.b * item.b) / (2 * priors.bSd * priors.bSd);
    if (!fixedC) {
        const alpha = priors.cConcentration * cPrior + 1;
        const beta = priors.cConcentration * (1 - cPrior) + 1;
        const c = clamp(item.c, 1e-6, 1 - 1e-6);
        value += (alpha - 1) * Math.log(c) + (beta - 1) * Math.log(1 - c);
    }
    return value;
}

/** Целевая функция M-шага: ожидаемое правдоподобие задания плюс априор. */
function objective(
    item: Item3pl,
    nodes: number[],
    expectedCount: number[],
    expectedCorrect: number[],
    cPrior: number,
    priors: Priors,
    fixedC: boolean,
): number {
    let value = 0;
    for (let k = 0; k < nodes.length; k++) {
        const n = expectedCount[k];
        if (n <= 0) continue;
        const p = clamp(probability3pl(nodes[k], item), 1e-9, 1 - 1e-9);
        value += expectedCorrect[k] * Math.log(p) + (n - expectedCorrect[k]) * Math.log(1 - p);
    }
    return value + logPrior(item, cPrior, priors, fixedC);
}

/** Градиент целевой функции по a, b, c. */
function gradient(
    item: Item3pl,
    nodes: number[],
    expectedCount: number[],
    expectedCorrect: number[],
    cPrior: number,
    priors: Priors,
    fixedC: boolean,
): { a: number; b: number; c: number } {
    let ga = 0;
    let gb = 0;
    let gc = 0;
    for (let k = 0; k < nodes.length; k++) {
        const n = expectedCount[k];
        if (n <= 0) continue;
        const theta = nodes[k];
        const z = SCALING_D * item.a * (theta - item.b);
        const psi = z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
        const p = clamp(item.c + (1 - item.c) * psi, 1e-9, 1 - 1e-9);
        // Общий множитель: d/dP от ожидаемого логарифма правдоподобия.
        const w = expectedCorrect[k] / p - (n - expectedCorrect[k]) / (1 - p);
        const common = (1 - item.c) * psi * (1 - psi);
        ga += w * SCALING_D * (theta - item.b) * common;
        gb += w * -SCALING_D * item.a * common;
        gc += w * (1 - psi);
    }
    // Производные априорных плотностей.
    ga += (-1 - Math.log(item.a) / (priors.aLogSd * priors.aLogSd)) / item.a;
    gb += -item.b / (priors.bSd * priors.bSd);
    if (!fixedC) {
        const alpha = priors.cConcentration * cPrior + 1;
        const beta = priors.cConcentration * (1 - cPrior) + 1;
        const c = clamp(item.c, 1e-6, 1 - 1e-6);
        gc += (alpha - 1) / c - (beta - 1) / (1 - c);
    } else {
        gc = 0;
    }
    return { a: ga, b: gb, c: gc };
}

/**
 * M-шаг для одного задания: подъём по градиенту с дроблением шага.
 *
 * Не Ньютон: матрица вторых производных по трём параметрам на разреженных
 * данных бывает вырожденной, и шаг по ней улетает за границы. Подъём с
 * гарантированным улучшением работает медленнее, зато не расходится — а
 * скорость здесь не важна, заданий полсотни.
 */
function maximizeItem(
    start: Item3pl,
    nodes: number[],
    expectedCount: number[],
    expectedCorrect: number[],
    cPrior: number,
    priors: Priors,
    fixedC: boolean,
): Item3pl {
    let item = { ...start };
    let current = objective(item, nodes, expectedCount, expectedCorrect, cPrior, priors, fixedC);

    for (let step = 0; step < 60; step++) {
        const g = gradient(item, nodes, expectedCount, expectedCorrect, cPrior, priors, fixedC);
        const norm = Math.hypot(g.a, g.b, g.c);
        if (!Number.isFinite(norm) || norm < 1e-8) break;

        let rate = 0.5 / Math.max(1, norm);
        let improved = false;
        for (let back = 0; back < 20; back++) {
            const candidate: Item3pl = {
                a: clamp(item.a + rate * g.a, BOUNDS.a.min, BOUNDS.a.max),
                b: clamp(item.b + rate * g.b, BOUNDS.b.min, BOUNDS.b.max),
                c: fixedC ? item.c : clamp(item.c + rate * g.c, BOUNDS.c.min, BOUNDS.c.max),
            };
            const value = objective(candidate, nodes, expectedCount, expectedCorrect, cPrior, priors, fixedC);
            if (value > current + 1e-12) {
                item = candidate;
                current = value;
                improved = true;
                break;
            }
            rate /= 2;
        }
        if (!improved) break;
    }
    return item;
}

const EM_TOLERANCE = 1e-4;
const EM_MAX_ITERATIONS = 200;

/**
 * Калибровка всех заданий варианта.
 *
 * Возвращает и параметры заданий, и апостериорные средние θ — они нужны
 * экрану сравнения, чтобы не считать способности второй раз другим способом.
 */
export function calibrate3pl(
    items: readonly CalibrationItemInput[],
    priors: Priors = DEFAULT_PRIORS,
): Calibration3plResult {
    const { nodes, weights } = quadrature();
    const itemCount = items.length;
    const personCount = itemCount > 0 ? items[0].responses.length : 0;

    // ═══ Инициализация (этап 2.2 разбора) ═══
    const cPriors = items.map((item) => (item.optionCount && item.optionCount > 1 ? 1 / item.optionCount : 0));
    const fixedC = items.map((item) => !item.optionCount || item.optionCount <= 1);
    const stats = items.map((item) => {
        let answered = 0;
        let correct = 0;
        for (const value of item.responses) {
            if (value === null) continue;
            answered++;
            correct += value;
        }
        return { answered, correct };
    });

    let current: Item3pl[] = items.map((_, i) => {
        const { answered, correct } = stats[i];
        // Стартовая трудность — логит доли верных, с поправкой на крайние доли.
        const adjusted = answered > 0 ? clamp((correct + 0.3) / (answered + 0.6), 0.02, 0.98) : 0.5;
        return {
            a: 1,
            b: clamp(-Math.log(adjusted / (1 - adjusted)), BOUNDS.b.min, BOUNDS.b.max),
            c: fixedC[i] ? 0 : cPriors[i],
        };
    });

    let abilities = new Array(personCount).fill(0);
    let converged = false;
    let iteration = 0;

    for (; iteration < EM_MAX_ITERATIONS; iteration++) {
        // ═══ E-шаг: апостериорное распределение θ каждого испытуемого ═══
        const expectedCount: number[][] = items.map(() => new Array(nodes.length).fill(0));
        const expectedCorrect: number[][] = items.map(() => new Array(nodes.length).fill(0));
        const nextAbilities = new Array(personCount).fill(0);

        for (let person = 0; person < personCount; person++) {
            const posterior = new Array(nodes.length).fill(0);
            let total = 0;
            for (let k = 0; k < nodes.length; k++) {
                // Логарифмами: произведение полусотни вероятностей иначе
                // обнуляется машинно.
                let logLikelihood = 0;
                for (let i = 0; i < itemCount; i++) {
                    const x = items[i].responses[person];
                    if (x === null) continue;
                    const p = clamp(probability3pl(nodes[k], current[i]), 1e-9, 1 - 1e-9);
                    logLikelihood += x === 1 ? Math.log(p) : Math.log(1 - p);
                }
                posterior[k] = logLikelihood + Math.log(weights[k]);
            }
            const maxLog = Math.max(...posterior);
            for (let k = 0; k < nodes.length; k++) {
                posterior[k] = Math.exp(posterior[k] - maxLog);
                total += posterior[k];
            }
            if (total <= 0) continue;
            for (let k = 0; k < nodes.length; k++) {
                const weight = posterior[k] / total;
                nextAbilities[person] += weight * nodes[k];
                for (let i = 0; i < itemCount; i++) {
                    const x = items[i].responses[person];
                    if (x === null) continue;
                    expectedCount[i][k] += weight;
                    if (x === 1) expectedCorrect[i][k] += weight;
                }
            }
        }
        abilities = nextAbilities;

        // ═══ M-шаг: параметры каждого задания ═══
        const next = current.map((item, i) =>
            maximizeItem(item, nodes, expectedCount[i], expectedCorrect[i], cPriors[i], priors, fixedC[i]),
        );

        let maxDelta = 0;
        for (let i = 0; i < itemCount; i++) {
            maxDelta = Math.max(
                maxDelta,
                Math.abs(next[i].a - current[i].a),
                Math.abs(next[i].b - current[i].b),
                Math.abs(next[i].c - current[i].c),
            );
        }
        current = next;
        if (maxDelta < EM_TOLERANCE) {
            converged = true;
            iteration++;
            break;
        }
    }

    return {
        items: current.map((item, i) => {
            const { answered, correct } = stats[i];
            const status: CalibratedItem["status"] =
                answered === 0 ? "NO_RESPONSES"
                    : correct === 0 ? "NONE_CORRECT"
                        : correct === answered ? "ALL_CORRECT"
                            : fixedC[i] ? "FIXED_GUESSING" : "OK";
            return { ...item, cPrior: cPriors[i], sampleSize: answered, correctCount: correct, status };
        }),
        abilities,
        iterations: iteration,
        converged,
        priors,
    };
}
