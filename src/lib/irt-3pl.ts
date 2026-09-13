// Трёхпараметрическая логистическая модель (3PL IRT).
//
// ═══ ЭТО ДЕЙСТВУЮЩАЯ МОДЕЛЬ БАЛЛА ═══
//
// Решением владельца от 2026-09-13 балл считает именно она: модель Раша из
// расчёта убрана, rasch.ts остался только шкалой (raschThetaToT) и
// вспомогательной арифметикой. §238 требовал не подменять Раша молча — смена
// оформлена отдельной моделью со своей версией (`3pl-1.0`) и ревизиями
// прежних баллов, а не правкой одномерной формулы на месте.
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
    /**
     * Информация ТЕСТА в точке θ — свойство набора заданий, без вклада
     * априорного распределения. Именно её показывают графики информации.
     */
    information: number;
    /**
     * Апостериорная погрешность: 1/√(I(θ) + 1/σ₀²). Она МЕНЬШЕ, чем 1/√I(θ),
     * потому что априорное знание тоже информация — и именно она отвечает
     * доверительному интервалу вокруг возвращённой θ.
     */
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

/** Априорное распределение способности. */
export type ThetaPrior = { mean: number; sd: number };

/**
 * N(0,1) — то же распределение, по которому идёт квадратура в калибровке.
 *
 * Это не настройка «на вкус»: E-шаг MMLE интегрирует апостериорное
 * распределение способности именно по N(0,1), и оценивать θ потом голым
 * максимумом правдоподобия значит считать балл по одной модели, а параметры
 * заданий — по другой.
 */
export const DEFAULT_THETA_PRIOR: ThetaPrior = { mean: 0, sd: 1 };

const THETA_TOLERANCE = 1e-4;
const MAX_ITERATIONS = 100;

/**
 * Оценка θ — байесовская модальная (MAP), метод Ньютона-Рафсона.
 *
 *   l′(θ) = Σ D·a_j · (X_j − P_j)(P_j − c_j) / (P_j(1 − c_j))  −  (θ − μ₀)/σ₀²
 *   l″(θ) = −( Σ I_j(θ) + 1/σ₀² )
 *   θ⁽ᵗ⁺¹⁾ = θ⁽ᵗ⁾ − l′/l″
 *
 * ═══ ПОЧЕМУ ЗДЕСЬ АПРИОРНОЕ РАСПРЕДЕЛЕНИЕ, А НЕ ЧИСТЫЙ МАКСИМУМ ═══
 *
 * Голый MLE в 3PL около уровня угадывания НЕ ИМЕЕТ МАКСИМУМА: ниже Σc
 * правдоподобие растёт монотонно, и θ уходит в −∞. Раньше такие работы
 * упирались в ±8 и получали это число как оценку.
 *
 * На боевой математике (36 работ, 55 заданий, Σc = 7,51) это касалось не
 * редкого случая, а ДЕВЯТИ работ из тридцати шести. Последствия были такие:
 *
 *   • ученик с 0 верных и ученик с 11 верными получали одну и ту же θ = −8,
 *     то есть один и тот же балл 33,47;
 *   • σ потока подскакивала с 0,99 до 3,40, а μ с −0,52 до −2,39 — и балл
 *     T = 50 + 10(θ−μ)/σ сжимался у ВСЕХ остальных: лучшая работа получала
 *     62,3 вместо 73,4, то есть B+ вместо A+.
 *
 * Априорное N(0,1) убирает это в корне: апостериорная плотность всегда имеет
 * максимум, θ конечна у любой работы, и никакой границы шкалы в данных не
 * возникает. Это стандартная байесовская модальная оценка (Mislevy 1986) —
 * тем же способом и по тем же причинам оцениваются параметры заданий в
 * irt-3pl-calibration.ts.
 *
 * Сдвиг к нулю (shrinkage), который вносит prior, на балл почти не влияет:
 * следом идёт центрирование по потоку, и общее сжатие θ уходит вместе с σ.
 *
 * ═══ ГРАНИЦА ШКАЛЫ БОЛЬШЕ НЕ СЧИТАЕТСЯ СХОДИМОСТЬЮ ═══
 *
 * Прежний цикл объявлял сходимость, как только шаг переставал двигать θ. У
 * работы, прижатой к ±8, шаг обрезался клэмпом, |Δ| выходил ровно 0 — и
 * расходящаяся оценка уезжала в базу со статусом OK. Диагностика показывала
 * ноль несошедшихся работ ровно там, где их было девять. Теперь остановка на
 * границе — это NON_CONVERGED.
 */
export function estimateTheta3pl(
    responses: readonly Response3pl[],
    prior: ThetaPrior = DEFAULT_THETA_PRIOR,
): Theta3plResult {
    const usable = responses.filter((r) => Number.isFinite(r.item.a) && Number.isFinite(r.item.b));
    if (usable.length === 0) {
        return { theta: NaN, information: 0, standardError: Infinity, iterations: 0, status: "NO_RESPONSES", trace: [] };
    }

    // Вклад априорного распределения в информацию — величина постоянная.
    const priorPrecision = prior.sd > 0 && Number.isFinite(prior.sd) ? 1 / (prior.sd * prior.sd) : 0;
    const items = usable.map((r) => r.item);

    const rawScore = usable.reduce((sum, r) => sum + r.correct, 0);
    const guessingFloor = usable.reduce((sum, r) => sum + r.item.c, 0);
    // Крайний балл БОЛЬШЕ НЕ ЗАМЕНЯЕТ оценку — он её только помечает. Сама θ
    // считается тем же способом, что у всех: апостериорный максимум есть и
    // здесь, потому что prior не даёт правдоподобию уйти в бесконечность.
    const extreme = rawScore >= usable.length || rawScore <= guessingFloor;

    // Стартовое приближение — логит доли верных, ограниченный шкалой. У
    // крайних долей логит бесконечен, поэтому старт берётся от среднего
    // априорного: это всего лишь точка входа, не результат.
    const proportion = rawScore / usable.length;
    const startLogit = proportion > 0 && proportion < 1 ? Math.log(proportion / (1 - proportion)) : prior.mean;
    let theta = Math.max(-THETA_BOUND, Math.min(THETA_BOUND, startLogit));

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
        // Вклад prior: производная логарифма плотности N(μ₀, σ₀).
        scoreFunction -= (theta - prior.mean) * priorPrecision;
        const posteriorInformation = information + priorPrecision;
        const secondDerivative = -posteriorInformation;
        if (posteriorInformation <= 1e-12) {
            trace.push({ iteration, theta, scoreFunction, secondDerivative, step: 0 });
            break;
        }

        const step = scoreFunction / posteriorInformation;
        // Шаг ограничивается одной логитой: на разреженных данных чистый
        // Ньютон улетает за шкалу с первой же итерации.
        const applied = Math.max(-1, Math.min(1, step));
        const next = Math.max(-THETA_BOUND, Math.min(THETA_BOUND, theta + applied));
        trace.push({ iteration, theta, scoreFunction, secondDerivative, step });
        const moved = Math.abs(next - theta);
        theta = next;
        if (moved < THETA_TOLERANCE) {
            // Остановка на границе шкалы — это не сходимость, а упор: шаг
            // обрезан клэмпом, а не исчерпан. Отличаем одно от другого.
            converged = Math.abs(theta) < THETA_BOUND || Math.abs(step) < THETA_TOLERANCE;
            iteration++;
            break;
        }
    }

    const information = testInformation3pl(theta, items);
    return {
        theta,
        information,
        standardError: standardError3pl(information + priorPrecision),
        iterations: iteration,
        // Крайний балл называется первым: он говорит о РАБОТЕ (ученик не
        // поднялся над уровнем угадывания либо решил всё), а не о численном
        // методе, и читателю важнее именно это.
        status: extreme ? "EXTREME_SCORE" : converged ? "OK" : "NON_CONVERGED",
        trace,
    };
}
