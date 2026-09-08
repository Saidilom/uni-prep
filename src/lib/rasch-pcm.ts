// PCM — Partial Credit Model, Masters (1982). ТЗ модуль J: §J.2, §J.4, §J.6,
// §J.8 (= §180–181), §J.9 (= §182–184).
//
// Политомное задание — то, за которое можно получить часть балла: категории
// 0, 1, …, m. Сочинение на 24 балла по рубрике — ровно такое задание, и сейчас
// оно считается ВНЕ модели, таблицей перевода. Этот модуль даёт математику,
// чтобы завести его внутрь.
//
// ═══ ФОРМУЛЫ (§J.2) ═══
//
//   ln[ P_nik / P_ni,k−1 ] = θ_n − τ_ik
//
//   P_nik = exp( Σ_{j=1..k} (θ_n − τ_ij) ) / Σ_{h=0..m} exp( Σ_{j=1..h} (θ_n − τ_ij) )
//
// где τ_ik — порог перехода из категории k−1 в k. При h = 0 сумма пустая, то
// есть числитель нулевой категории равен exp(0) = 1 (это и есть соглашение
// b_i0 = 0 из спеки).
//
// Ожидаемый балл и дисперсия (§J.4):
//
//   E_ni = Σ_k k · P_nik
//   V_ni = Σ_k (k − E_ni)² · P_nik
//
// Информация политомного задания равна этой же дисперсии (§J.9): I_ni = V_ni.
// Для m = 1 всё вырождается в дихотомический Раш — V = P(1−P) — и это
// проверяется тестом, потому что обратная совместимость здесь важнее краткости.
//
// ═══ ЧЕГО ЗДЕСЬ СОЗНАТЕЛЬНО НЕТ ═══
//
// Пороги НЕ выводятся усреднением процентов или пропорцией от максимума —
// §180 это прямо запрещает. Они оцениваются по likelihood: уравнение оценки
// (см. estimateThresholds) требует, чтобы НАБЛЮДЁННОЕ число дошедших до
// категории k совпало с ОЖИДАЕМЫМ по модели.
//
// И отсюда же следует, когда оценка невозможна: если до категории k не дошёл
// никто, левая часть уравнения равна нулю, и τ_k уходит в +∞. §J.5 требует,
// чтобы каждая категория имела наблюдения, а §219–220 — исключать задание, на
// которое все ответили одинаково. Поэтому estimateThresholds возвращает
// СТАТУС, а не выдуманные числа.

const THRESHOLD_CLAMP = 8;
const DEFAULT_TOLERANCE = 1e-6;
const DEFAULT_MAX_ITERATIONS = 200;

/**
 * Вероятности всех категорий при данной способности.
 *
 * `thresholds` — τ_1..τ_m, то есть m порогов для m+1 категорий. Возвращает
 * массив длины m+1: [P_0, P_1, …, P_m].
 *
 * Считается через log-sum-exp (§O.1): прямой exp(Σ(θ−τ)) переполняется уже при
 * θ около 700/m, а на клампах ±8 и двадцати категориях это достижимо.
 */
export function categoryProbabilities(theta: number, thresholds: number[]): number[] {
    const m = thresholds.length;
    // Логарифм числителя категории k: k·θ − Σ_{j≤k} τ_j.
    const logNumerators = new Array(m + 1).fill(0);
    let cumulative = 0;
    for (let k = 1; k <= m; k++) {
        cumulative += thresholds[k - 1];
        logNumerators[k] = k * theta - cumulative;
    }
    const maxLog = Math.max(...logNumerators);
    let denominator = 0;
    const shifted = logNumerators.map((v) => {
        const e = Math.exp(v - maxLog);
        denominator += e;
        return e;
    });
    return shifted.map((e) => e / denominator);
}

/** Ожидаемый балл E_ni = Σ k·P_nik (§J.4). */
export function expectedScore(theta: number, thresholds: number[]): number {
    const probabilities = categoryProbabilities(theta, thresholds);
    let expected = 0;
    for (let k = 0; k < probabilities.length; k++) expected += k * probabilities[k];
    return expected;
}

/**
 * Дисперсия категорий V_ni = Σ (k − E)²·P_nik (§J.4).
 *
 * Она же — информация политомного задания (§J.9), поэтому отдельной функции
 * для информации нет: это одна величина, и заводить ей два имени значило бы
 * позволить им однажды разойтись.
 */
export function scoreVariance(theta: number, thresholds: number[]): number {
    const probabilities = categoryProbabilities(theta, thresholds);
    let expected = 0;
    for (let k = 0; k < probabilities.length; k++) expected += k * probabilities[k];
    let variance = 0;
    for (let k = 0; k < probabilities.length; k++) variance += (k - expected) ** 2 * probabilities[k];
    return variance;
}

/** Информация политомного задания. Псевдоним дисперсии — §J.9: I_ni = V_ni. */
export const polytomousInformation = scoreVariance;

/**
 * Стандартизованный остаток политомного ответа (§F.3 в политомном виде,
 * §J.9): z = (X − E) / √V. Из него собираются Infit и Outfit теми же
 * формулами, что для дихотомических заданий — §182–184 именно это и требуют.
 */
export function standardizedResidual(observed: number, theta: number, thresholds: number[]): number | null {
    const variance = scoreVariance(theta, thresholds);
    if (!(variance > 0) || !Number.isFinite(observed)) return null;
    return (observed - expectedScore(theta, thresholds)) / Math.sqrt(variance);
}

export type PolytomousFit = {
    /** Outfit MNSQ — среднее z² (§F.4). Чувствителен к выбросам. */
    outfit: number | null;
    /** Infit MNSQ — Σ(X−E)² / ΣV (§F.5). Взвешен информацией. */
    infit: number | null;
    /** Сколько наблюдений вошло в расчёт. */
    observations: number;
};

/**
 * Infit и Outfit политомного задания (§J.9 = §182–184).
 *
 * Формулы те же, что для дихотомического случая; меняются только E и V — они
 * берутся из PCM, а не из P(1−P). Наблюдения с нулевой дисперсией пропускаются:
 * там z не определён, и подставлять ноль значило бы улучшить fit выдумкой.
 */
export function polytomousFit(
    responses: ReadonlyArray<{ observed: number; theta: number }>,
    thresholds: number[],
): PolytomousFit {
    let sumZ2 = 0;
    let sumSquaredResidual = 0;
    let sumVariance = 0;
    let counted = 0;
    for (const r of responses) {
        const variance = scoreVariance(r.theta, thresholds);
        if (!(variance > 0)) continue;
        const residual = r.observed - expectedScore(r.theta, thresholds);
        sumZ2 += (residual * residual) / variance;
        sumSquaredResidual += residual * residual;
        sumVariance += variance;
        counted++;
    }
    if (counted === 0) return { outfit: null, infit: null, observations: 0 };
    return {
        outfit: sumZ2 / counted,
        infit: sumVariance > 0 ? sumSquaredResidual / sumVariance : null,
        observations: counted,
    };
}

/**
 * Разупорядоченные пороги (§J.6): τ идут не по возрастанию.
 *
 * Признак того, что категория никогда не бывает самой вероятной, то есть
 * рубрика различает то, чего в ответах не видно. Возвращаем ФЛАГ — объединять
 * категории здесь нельзя: §J.7 и запрет NO SILENT CATEGORY CHANGE требуют
 * явного решения с версией.
 */
export function disorderedThresholds(thresholds: number[]): number[] {
    const disordered: number[] = [];
    for (let k = 1; k < thresholds.length; k++) {
        if (thresholds[k] < thresholds[k - 1]) disordered.push(k);
    }
    return disordered;
}

export type ThresholdStatus =
    | "OK"
    /** До какой-то категории не дошёл никто, либо все дошли — порог уходит в ±∞ (§J.5, §219–220). */
    | "EMPTY_CATEGORY"
    /** Итерации не сошлись за max_iter (§C.4). */
    | "NON_CONVERGED"
    /** Нет наблюдений вообще. */
    | "NO_RESPONSES";

export type ThresholdEstimate = {
    /** τ_1..τ_m. Пусто, когда статус не OK: выдуманных чисел здесь не бывает. */
    thresholds: number[];
    status: ThresholdStatus;
    iterations: number;
    /** Категории без наблюдений — те, из-за которых оценка невозможна. */
    emptyCategories: number[];
    /** Индексы разупорядоченных порогов (§J.6). Флаг, не приговор. */
    disordered: number[];
    /** Сколько наблюдений в каждой категории 0..m. */
    categoryCounts: number[];
};

/**
 * Оценка порогов τ_ik ПО LIKELIHOOD (§J.8 = §180).
 *
 * Уравнение оценки получается из ∂logL/∂τ_k = 0 и читается содержательно:
 *
 *   Σ_n 1{x_n ≥ k}  =  Σ_n P(x_n ≥ k | θ_n, τ)
 *   наблюдённое число дошедших до категории k = ожидаемое по модели
 *
 * Ньютон по каждому порогу с информацией Фишера в знаменателе:
 *
 *   τ_k ← τ_k + (ожидаемое_k − наблюдённое_k) / Σ_n Q_nk(1 − Q_nk),
 *   где Q_nk = P(x_n ≥ k)
 *
 * Знак именно такой: чем больше τ_k, тем труднее дойти до категории k, тем
 * меньше ожидаемое. Значит при ожидаемом больше наблюдённого порог надо
 * поднять.
 *
 * Способности θ здесь СЧИТАЮТСЯ ИЗВЕСТНЫМИ и не пересчитываются: калибровка
 * порогов и оценка ученика — разные шаги (§E.1).
 *
 * ПОЧЕМУ ЗДЕСЬ ЕСТЬ ОТКАЗ. Если до категории k не дошёл никто, левая часть
 * уравнения — ноль, и корня не существует: τ_k уходит в +∞. §J.5 требует
 * наблюдений в каждой категории, §219–220 — исключать задание, на котором все
 * ответили одинаково. Поэтому возвращается статус EMPTY_CATEGORY и ПУСТОЙ
 * список порогов: подставить сюда «пропорцию от максимума» было бы прямым
 * нарушением §180.
 */
export function estimateThresholds(
    responses: ReadonlyArray<{ observed: number; theta: number }>,
    categoryCount: number,
    opts: { tolerance?: number; maxIterations?: number } = {},
): ThresholdEstimate {
    const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
    const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const m = categoryCount - 1;

    const usable = responses.filter(
        (r) => Number.isFinite(r.theta) && Number.isInteger(r.observed) && r.observed >= 0 && r.observed <= m,
    );
    const categoryCounts = new Array(categoryCount).fill(0);
    for (const r of usable) categoryCounts[r.observed]++;

    const empty: number[] = [];
    for (let k = 0; k < categoryCount; k++) if (categoryCounts[k] === 0) empty.push(k);

    if (usable.length === 0) {
        return { thresholds: [], status: "NO_RESPONSES", iterations: 0, emptyCategories: empty, disordered: [], categoryCounts };
    }
    if (m < 1) {
        // Одна категория — это не политомное задание, а константа.
        return { thresholds: [], status: "EMPTY_CATEGORY", iterations: 0, emptyCategories: empty, disordered: [], categoryCounts };
    }
    if (empty.length > 0) {
        return { thresholds: [], status: "EMPTY_CATEGORY", iterations: 0, emptyCategories: empty, disordered: [], categoryCounts };
    }

    // Наблюдённое число дошедших до категории k, k = 1..m.
    const observedReaching = new Array(m + 1).fill(0);
    for (const r of usable) {
        for (let k = 1; k <= r.observed; k++) observedReaching[k]++;
    }

    // Старт — логит доли дошедших, сдвинутый средней способностью. Это только
    // точка старта: ответ определяется уравнением, а не ею (§C.2).
    const meanTheta = usable.reduce((acc, r) => acc + r.theta, 0) / usable.length;
    const thresholds = new Array(m).fill(0).map((_, i) => {
        const share = observedReaching[i + 1] / usable.length;
        const bounded = Math.min(1 - 1 / (2 * usable.length), Math.max(1 / (2 * usable.length), share));
        return Math.min(THRESHOLD_CLAMP, Math.max(-THRESHOLD_CLAMP, meanTheta - Math.log(bounded / (1 - bounded))));
    });

    let iterations = 0;
    let converged = false;
    for (; iterations < maxIterations; iterations++) {
        // Ожидаемое число дошедших и информация по каждому порогу.
        const expectedReaching = new Array(m + 1).fill(0);
        const information = new Array(m + 1).fill(0);
        for (const r of usable) {
            const probabilities = categoryProbabilities(r.theta, thresholds);
            // Q_nk = P(x ≥ k) — хвостовая сумма, считается с конца.
            let tail = 0;
            for (let k = m; k >= 1; k--) {
                tail += probabilities[k];
                expectedReaching[k] += tail;
                information[k] += tail * (1 - tail);
            }
        }

        let maxDelta = 0;
        for (let k = 1; k <= m; k++) {
            if (information[k] <= 1e-10) continue;
            const step = (expectedReaching[k] - observedReaching[k]) / information[k];
            // Демпфирование и клампы — как в estimateRasch: на малой выборке
            // шаг Ньютона иначе улетает за пределы шкалы и не возвращается.
            const damped = Math.tanh(step);
            const next = Math.min(THRESHOLD_CLAMP, Math.max(-THRESHOLD_CLAMP, thresholds[k - 1] + damped));
            maxDelta = Math.max(maxDelta, Math.abs(next - thresholds[k - 1]));
            thresholds[k - 1] = next;
        }
        if (maxDelta < tolerance) {
            converged = true;
            iterations++;
            break;
        }
    }

    return {
        thresholds,
        status: converged ? "OK" : "NON_CONVERGED",
        iterations,
        emptyCategories: empty,
        // §J.6: разупорядоченность — флаг рядом с оценкой, а не причина её
        // подменить. Решение об объединении категорий принимает человек (§J.7).
        disordered: disorderedThresholds(thresholds),
        categoryCounts,
    };
}
