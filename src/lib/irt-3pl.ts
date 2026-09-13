// Трёхпараметрическая логистическая модель (3PL IRT).
//
// ═══ ЭТО ОТДЕЛЬНАЯ МОДЕЛЬ, А НЕ ПРАВКА РАША ═══
//
// §238 нормы прямо требует: «если появляется discrimination или guessing
// parameter — это уже отдельная IRT model». Поэтому файл живёт рядом с
// rasch.ts, ничего в нём не меняет и в расчёт балла не вмешивается. Балл
// ученика по-прежнему считает одномерная модель Раша.
//
// Здесь — реализация по разбору, присланному владельцем 2026-09-13:
//
//   P_i(θ) = c_i + (1 − c_i) · 1/(1 + e^(−D·a_i·(θ − b_i)))
//
//   a — дискриминация (крутизна кривой в точке перегиба)
//   b — трудность (θ, при которой P = (1+c)/2)
//   c — псевдоугадывание (нижняя асимптота)
//   D — масштабный коэффициент 1.702, приближает логистику к нормальной огиве
//
// ═══ ЧТО ЗДЕСЬ ВАЖНО ЗНАТЬ ЗАРАНЕЕ ═══
//
// 3PL оценивает ТРИ параметра на задание вместо одного. Для устойчивых оценок
// в литературе называют порядок 1000 испытуемых на задание; у нас на боевом
// моке 36 при 55 заданиях — около 10 наблюдений на параметр. Поэтому
// калибровка здесь байесовская (модальная оценка с априорными распределениями,
// Mislevy 1986): без них MMLE на такой выборке расходится — c уползает куда
// попало, a взрывается на заданиях, которые не решил никто.
//
// Насколько это надёжно на КОНКРЕТНЫХ данных, показывают тесты рядом
// (irt-3pl.test.ts) и экран сравнения: то же самое восстановление параметров
// прогоняется на N = 2000 и на N = 36, и разброс виден числом.

/** Масштабный коэффициент. 1.702 сближает логистику с нормальной огивой. */
export const SCALING_D = 1.702;

/** Те же ±8 логит, что и в модели Раша: дальше различий уже нет практических. */
const THETA_BOUND = 8;

export type Item3pl = {
    /** Дискриминация. */
    a: number;
    /** Трудность в логитах. */
    b: number;
    /** Псевдоугадывание, 0..1. У заданий со свободным ответом строго 0. */
    c: number;
};

/**
 * Численно устойчивая логистика (§O.1): при большом |x| прямая exp
 * переполняется, и ветка для отрицательных значений считает через e^x.
 */
function logistic(x: number): number {
    if (x >= 0) return 1 / (1 + Math.exp(-x));
    const e = Math.exp(x);
    return e / (1 + e);
}

/** P_i(θ) — вероятность верного ответа по 3PL. */
export function probability3pl(theta: number, item: Item3pl): number {
    return item.c + (1 - item.c) * logistic(SCALING_D * item.a * (theta - item.b));
}

/**
 * Производная dP/dθ. Нужна и информационной функции, и проверке тестом:
 * численная разность обязана с ней совпасть.
 */
export function probabilityDerivative3pl(theta: number, item: Item3pl): number {
    const logit = logistic(SCALING_D * item.a * (theta - item.b));
    return SCALING_D * item.a * (1 - item.c) * logit * (1 - logit);
}

/**
 * Информация одного задания.
 *
 *   I_i(θ) = (dP/dθ)² / (P(1−P)) = D²·a²·(P−c)²·(1−P) / ((1−c)²·P)
 *
 * ═══ ФОРМУЛА ВЫВЕДЕНА ЗАНОВО, А НЕ ПЕРЕПИСАНА ═══
 *
 * В присланном разборе она набрана с ошибкой: там (1−c) в первой степени, а из
 * P = c + (1−c)ψ следует вторая. Разница — множитель (1−c), при c = 0.25 это
 * 25% информации и, значит, неверная SE у каждого ученика.
 *
 * Поймал это тест «совпадает с производной вероятности численно»: конечная
 * разность dP/dθ не сошлась с I(θ)·P(1−P). Текст разбора вообще пришёл с
 * повреждениями (в одном месте в формулу затесались посторонние символы), так
 * что переписывать его вслепую было нельзя.
 *
 * При c = 0 сводится к D²a²·P(1−P), а при a = 1 и D = 1 — к P(1−P), той же
 * информации, что в модели Раша.
 */
export function itemInformation3pl(theta: number, item: Item3pl): number {
    const p = probability3pl(theta, item);
    // У выродившегося задания информации нет: делить не на что.
    if (p <= 0 || p >= 1 || item.c >= 1) return 0;
    const ratio = (p - item.c) / (1 - item.c);
    return SCALING_D * SCALING_D * item.a * item.a * ratio * ratio * (1 - p) / p;
}

/** I(θ) = Σ I_i(θ) — информация всего теста. */
export function testInformation3pl(theta: number, items: readonly Item3pl[]): number {
    return items.reduce((sum, item) => sum + itemInformation3pl(theta, item), 0);
}

/** SE(θ) = 1/√I(θ). Бесконечная информация невозможна, нулевая — бывает. */
export function standardError3pl(information: number): number {
    return information > 0 ? 1 / Math.sqrt(information) : Number.POSITIVE_INFINITY;
}

export type ThetaIteration = {
    iteration: number;
    theta: number;
    /** Первая производная логарифма правдоподобия. */
    scoreFunction: number;
    /** Вторая производная, равна −I(θ). */
    secondDerivative: number;
    /** Шаг Ньютона-Рафсона до ограничения. */
    step: number;
};

export type Theta3plStatus = "OK" | "NON_CONVERGED" | "NO_RESPONSES" | "EXTREME_SCORE";

export type Theta3plResult = {
    theta: number;
    information: number;
    standardError: number;
    iterations: number;
    status: Theta3plStatus;
    /**
     * Каждая итерация целиком — ради прозрачности. Экран показывает этот след,
     * и любое число из него можно повторить на калькуляторе.
     */
    trace: ThetaIteration[];
};

export type Response3pl = { correct: 0 | 1; item: Item3pl };

const THETA_TOLERANCE = 1e-4;
const MAX_ITERATIONS = 100;

/**
 * Оценка θ методом Ньютона-Рафсона (этап 2.4 разбора).
 *
 *   l′(θ) = Σ D·a_j · (X_j − P_j)(P_j − c_j) / (P_j(1 − c_j))
 *   l″(θ) = −Σ I_j(θ)
 *   θ⁽ᵗ⁺¹⁾ = θ⁽ᵗ⁾ − l′/l″
 *
 * ═══ КРАЙНИЕ БАЛЛЫ ═══
 *
 * У 3PL, в отличие от Раша, конечная оценка отсутствует не только при нулевом
 * балле: ниже суммы угадываний Σc правдоподобие растёт монотонно и максимума
 * не имеет — θ уходит в −∞. Такие работы помечаются EXTREME_SCORE и получают
 * границу шкалы, а не выдуманное число.
 */
export function estimateTheta3pl(responses: readonly Response3pl[]): Theta3plResult {
    const usable = responses.filter((r) => Number.isFinite(r.item.a) && Number.isFinite(r.item.b));
    if (usable.length === 0) {
        return { theta: NaN, information: 0, standardError: Infinity, iterations: 0, status: "NO_RESPONSES", trace: [] };
    }

    const rawScore = usable.reduce((sum, r) => sum + r.correct, 0);
    const guessingFloor = usable.reduce((sum, r) => sum + r.item.c, 0);
    if (rawScore >= usable.length) {
        const theta = THETA_BOUND;
        const items = usable.map((r) => r.item);
        const information = testInformation3pl(theta, items);
        return { theta, information, standardError: standardError3pl(information), iterations: 0, status: "EXTREME_SCORE", trace: [] };
    }
    if (rawScore <= guessingFloor) {
        const theta = -THETA_BOUND;
        const items = usable.map((r) => r.item);
        const information = testInformation3pl(theta, items);
        return { theta, information, standardError: standardError3pl(information), iterations: 0, status: "EXTREME_SCORE", trace: [] };
    }

    // Стартовое приближение — логит доли верных, как в разборе (этап 2.2).
    const proportion = rawScore / usable.length;
    let theta = Math.max(-THETA_BOUND, Math.min(THETA_BOUND, Math.log(proportion / (1 - proportion))));

    const trace: ThetaIteration[] = [];
    let converged = false;
    let iteration = 0;

    for (; iteration < MAX_ITERATIONS; iteration++) {
        let scoreFunction = 0;
        let information = 0;
        for (const { correct, item } of usable) {
            const p = probability3pl(theta, item);
            if (p <= 0 || p >= 1) continue;
            // l′ = Σ (X−P)/(P(1−P)) · dP/dθ, а dP/dθ = D·a·(P−c)(1−P)/(1−c).
            // После сокращения (1−P):  D·a·(X−P)(P−c) / (P(1−c)).
            // В разборе в знаменателе стояло (1−P) вместо (1−c) — с ним оценка
            // θ не сходилась вовсе (тест «восстанавливает θ» это и показал).
            scoreFunction += SCALING_D * item.a * ((correct - p) * (p - item.c)) / (p * (1 - item.c));
            information += itemInformation3pl(theta, item);
        }
        const secondDerivative = -information;
        if (information <= 1e-12) {
            trace.push({ iteration, theta, scoreFunction, secondDerivative, step: 0 });
            break;
        }

        const step = scoreFunction / information;
        // Шаг ограничивается одной логитой: на разреженных данных чистый
        // Ньютон улетает за шкалу с первой же итерации.
        const applied = Math.max(-1, Math.min(1, step));
        const next = Math.max(-THETA_BOUND, Math.min(THETA_BOUND, theta + applied));
        trace.push({ iteration, theta, scoreFunction, secondDerivative, step });
        const moved = Math.abs(next - theta);
        theta = next;
        if (moved < THETA_TOLERANCE) {
            converged = true;
            iteration++;
            break;
        }
    }

    const items = usable.map((r) => r.item);
    const information = testInformation3pl(theta, items);
    return {
        theta,
        information,
        standardError: standardError3pl(information),
        iterations: iteration,
        status: converged ? "OK" : "NON_CONVERGED",
        trace,
    };
}
