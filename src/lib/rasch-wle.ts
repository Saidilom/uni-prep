// WLE — Weighted Likelihood Estimation, Warm (1989). ТЗ §C.6, §C.8, §20.
//
// ЗАЧЕМ. У обычного MLE нет конечного решения при нулевом и максимальном сырых
// баллах: ожидаемый балл приближается к границе, но никогда её не достигает, и
// оценка уходит в ±∞ (§C.5). §C.5 и §20 прямо запрещают подменять эту
// бесконечность числом «от руки».
//
// Что было у нас. Захардкоженного θ = −6 в коде нет и не было — проверено. То
// −5,97, которое видно у ученика с нулём верных на проде, это результат
// поправки Wright & Panchapakesan (1969): наблюдаемый балл сдвигается на 0.3
// внутрь шкалы, и оценка становится большой, но конечной. Метод опубликованный,
// то есть §234 («никаких коэффициентов без математического происхождения») он
// не нарушает. Но норма требует другого: §C.8 называет WLE ОСНОВНЫМ оценщиком
// способности, и он даёт конечную θ по построению, а не сдвигом данных.
//
// ФОРМУЛЫ (§C.8):
//
//   U_W(θ) = Σ_i (x_i − P_i) + J(θ) / (2·I(θ))
//   I(θ)   = Σ_i P_i(1 − P_i)
//   J(θ)   = Σ_i P_i(1 − P_i)(1 − 2P_i)
//
// Решается U_W(θ) = 0.
//
// ПОЧЕМУ РЕШЕНИЕ КОНЕЧНО ДАЖЕ ПРИ 0 И 100%. При θ → −∞ все P → 0, поэтому
// Σ(x−P) → 0, а I → 0 и J → I, значит поправка J/(2I) → +1/2. То есть
// U_W → +1/2 > 0 и корень лежит правее: конечный. Симметрично при θ → +∞
// поправка → −1/2, и U_W → −1/2 < 0. Именно поэтому WLE не нуждается ни в
// сдвиге балла, ни в подстановке числа.
//
// WLE — ОТДЕЛЬНАЯ версия оценщика, и выдавать его результат под именем MLE
// нельзя (§C.8). Поэтому estimator и его версия возвращаются наружу и
// сохраняются вместе с баллом.

export const WLE_ESTIMATOR = "WLE_WARM_1989" as const;
export const WLE_VERSION = "1.0" as const;

export type WleStatus = "OK" | "NON_CONVERGED" | "NO_RESPONSES";

export type WleResult = {
    /** Оценка способности в логитах. NaN только при NO_RESPONSES. */
    theta: number;
    /** Информация теста в точке оценки — та же I(θ), что в §D.3. */
    information: number;
    iterations: number;
    status: WleStatus;
    estimator: typeof WLE_ESTIMATOR;
    estimatorVersion: typeof WLE_VERSION;
};

// Границы поиска. Те же ±8 логит, что и в estimateRasch: за ними разница
// вероятностей уже меньше 0.1% против 99.9%, и практического различия нет.
const THETA_BOUND = 8;

// Сходимость по §C.3: и по изменению параметра, и по остатку score function.
const DEFAULT_TOLERANCE = 1e-6;
const DEFAULT_MAX_ITERATIONS = 100;

const logistic = (x: number): number => {
    // Численно устойчивая форма (§O.1): при большом |x| прямая exp переполняется.
    if (x >= 0) {
        const e = Math.exp(-x);
        return 1 / (1 + e);
    }
    const e = Math.exp(x);
    return e / (1 + e);
};

type Terms = { u: number; information: number };

// U_W(θ) и I(θ) одним проходом: обе суммы идут по тем же слагаемым.
function weightedScore(theta: number, responses: ReadonlyArray<{ correct: 0 | 1; difficulty: number }>): Terms {
    let residual = 0;
    let information = 0;
    let j = 0;
    for (const r of responses) {
        const p = logistic(theta - r.difficulty);
        const pq = p * (1 - p);
        residual += r.correct - p;
        information += pq;
        j += pq * (1 - 2 * p);
    }
    // При вырожденной информации поправка Warm не определена. Такое бывает
    // только у θ, уехавшей далеко за пределы всех сложностей, и границы поиска
    // ниже такой случай отсекают, не подставляя ничего своего.
    const correction = information > 0 ? j / (2 * information) : 0;
    return { u: residual + correction, information };
}

// Оценка способности методом WLE.
//
// Ньютон с шагом θ ← θ + U_W/I: в качестве знаменателя берётся информация
// Фишера, а не полная производная U_W. Это Fisher scoring — стандартный приём
// для этого уравнения: производная поправки Warm мала по сравнению с −I, а
// I гарантированно положительна, поэтому шаг всегда направлен верно и метод не
// делится на почти-ноль второй производной.
//
// Ньютон подстрахован бисекцией: U_W убывает по θ (главный член производной
// равен −I < 0), поэтому корень на [−8, +8] локализуется гарантированно. Без
// подстраховки шаг Ньютона на почти вырожденном наборе ответов может
// выбросить θ за границы и уже не вернуть — на малых выборках это происходит
// (тот же дефект, из-за которого в estimateRasch появилось демпфирование).
export function estimateThetaWle(
    responses: ReadonlyArray<{ correct: 0 | 1; difficulty: number }>,
    opts: { tolerance?: number; maxIterations?: number } = {},
): WleResult {
    const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
    const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;

    const usable = responses.filter((r) => Number.isFinite(r.difficulty));
    if (usable.length === 0) {
        // §217: ни одного наблюдения — возвращаем статус, а не число.
        return {
            theta: Number.NaN, information: 0, iterations: 0,
            status: "NO_RESPONSES", estimator: WLE_ESTIMATOR, estimatorVersion: WLE_VERSION,
        };
    }

    // Стартовое значение — PROX-приближение из §C.2: логит доли верных,
    // сдвинутый средней сложностью. Для крайних баллов доля зажимается внутрь
    // интервала, и это НЕ подмена оценки: сдвигается только точка старта,
    // ответ определяется уравнением U_W = 0.
    const raw = usable.reduce((acc, r) => acc + r.correct, 0);
    const meanDifficulty = usable.reduce((acc, r) => acc + r.difficulty, 0) / usable.length;
    const share = Math.min(1 - 1 / (2 * usable.length), Math.max(1 / (2 * usable.length), raw / usable.length));
    let theta = Math.min(THETA_BOUND, Math.max(-THETA_BOUND, Math.log(share / (1 - share)) + meanDifficulty));

    // Бисекция держит корень: U_W убывает, поэтому слева от корня она
    // положительна, справа отрицательна.
    let lo = -THETA_BOUND;
    let hi = THETA_BOUND;
    let iterations = 0;
    let converged = false;
    let terms = weightedScore(theta, usable);

    for (; iterations < maxIterations; iterations++) {
        if (terms.u > 0) lo = theta; else hi = theta;
        if (Math.abs(terms.u) < tolerance) { converged = true; break; }

        const step = terms.information > 0 ? terms.u / terms.information : 0;
        let next = theta + step;
        // Вышли за локализованный интервал или шаг не сдвинул точку — берём
        // середину. Так метод не может ни расходиться, ни зависнуть.
        if (!Number.isFinite(next) || next <= lo || next >= hi) next = (lo + hi) / 2;

        if (Math.abs(next - theta) < tolerance) {
            theta = next;
            terms = weightedScore(theta, usable);
            converged = true;
            iterations++;
            break;
        }
        theta = next;
        terms = weightedScore(theta, usable);
    }

    return {
        theta,
        information: terms.information,
        iterations,
        // §C.4: недостижение сходимости — явный статус, а не тихий результат.
        status: converged ? "OK" : "NON_CONVERGED",
        estimator: WLE_ESTIMATOR,
        estimatorVersion: WLE_VERSION,
    };
}
