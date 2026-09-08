// Fit-диагностика: насколько ответы согласуются с моделью. ТЗ модуль F —
// §F.1–F.11, плюс §221 (ошибка ключа) и §224 (не удалять молча).
//
// ЗАЧЕМ. Сейчас ни одно задание не проверено на соответствие модели. Это
// значит, что задание с перепутанным ключом, дублирующее другое или просто
// сломанное участвует в измерении наравне с исправными, и заметить это нечем.
// Fit — единственный механизм, который на это указывает.
//
// ═══ ФОРМУЛЫ ═══
//
// §F.2, §F.3 — ожидаемая дисперсия и стандартизованный остаток:
//
//   W_ni = P_ni(1 − P_ni)
//   z_ni = (X_ni − P_ni) / √W_ni
//
// §F.4 — Outfit MNSQ, невзвешенное среднее квадратов остатков. Чувствителен к
// выбросам: неожиданный ответ на очень лёгкое или очень трудное задание даёт
// огромный z, потому что там W мало.
//
//   Outfit = (1/N) · Σ z_ni²
//
// §F.5 — Infit MNSQ, взвешенный информацией. Наблюдения с малым W входят с
// малым весом, поэтому выбросы на краях его почти не двигают.
//
//   Infit = Σ (X_ni − P_ni)² / Σ W_ni
//
// §F.7 — 1.0 означает «наблюдаемая вариация остатков равна ожидаемой моделью».
// 1.20 — на 20% больше. Рабочий диапазон 0.5–1.5.
//
// §F.9 — ZSTD, стандартизованное t-значение MNSQ через кубическое
// преобразование Wilson–Hilferty:
//
//   ZSTD = (MNSQ^(1/3) − 1) · (3/q) + (q/3),   q = √Var(MNSQ)
//
// Дисперсии выведены, а не взяты на веру. Для бинарного ответа
// E[(X−P)⁴] = W(1 − 3W), поэтому
//
//   Var(z²)    = E[z⁴] − 1 = (1 − 3W)/W − 1 = 1/W − 4
//   Var(Outfit) = (1/N²) · Σ (1/W_n − 4)
//   Var(Infit)  = Σ (W_n − 4W_n²) / (Σ W_n)²
//
// (для Infit: Var(W·z²) = W²·Var(z²) = W² (1/W − 4) = W − 4W².)
//
// ═══ ЧЕГО ЗДЕСЬ НЕТ ═══
//
// Автоматического удаления заданий. §224 требует прямо: помечать, но не
// удалять молча. Поэтому модуль возвращает ФЛАГИ, и ни одна его функция ничего
// не исключает из расчёта. Решение принимает человек.

import { standardizedResidual as polytomousResidual } from "./rasch-pcm";

// §F.7: рабочий диапазон MNSQ. Для высоких ставок норма допускает жёстче
// (0.7–1.3), но задание владельца — 0.5–1.5, и менять это без его решения
// нельзя: границы решают, какие задания попадут на пересмотр.
export const MISFIT_LOW = 0.5;
export const MISFIT_HIGH = 1.5;

// Вероятность ответа по модели Раша. Численно устойчивая форма (§O.1).
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
 * §F.3: стандартизованный остаток z = (X − P)/√(P(1−P)).
 *
 * Считается через политомную формулу с одним порогом, а не своей копией:
 * дихотомическое задание — это PCM с двумя категориями, и там E = P,
 * V = P(1−P) (доказано тестами rasch-pcm). Держать формулу дважды значило бы
 * позволить двум копиям однажды разойтись.
 */
export function standardizedResidual(correct: 0 | 1, theta: number, difficulty: number): number | null {
    return polytomousResidual(correct, theta, [difficulty]);
}

export type FitObservation = {
    correct: 0 | 1;
    theta: number;
    difficulty: number;
};

export type FitStats = {
    /** §F.5. null — когда суммарная информация нулевая и делить не на что. */
    infit: number | null;
    /** §F.4. */
    outfit: number | null;
    /** §F.9, Wilson–Hilferty. */
    infitZstd: number | null;
    outfitZstd: number | null;
    /** Сколько наблюдений вошло в расчёт. */
    observations: number;
};

// Ниже этого W наблюдение в fit не берётся: z = (X−P)/√W при W → 0 уходит в
// бесконечность и один такой ответ перекрывает всю статистику. §O.2 требует
// зажимать вероятности; здесь это тот же смысл, только на уровне дисперсии.
const MIN_VARIANCE = 1e-10;

/** §F.9: ZSTD из MNSQ и его дисперсии, преобразование Wilson–Hilferty. */
export function mnsqToZstd(mnsq: number, variance: number): number | null {
    if (!Number.isFinite(mnsq) || mnsq <= 0) return null;
    if (!Number.isFinite(variance) || variance <= 0) return null;
    const q = Math.sqrt(variance);
    return (Math.cbrt(mnsq) - 1) * (3 / q) + q / 3;
}

/**
 * Infit, Outfit и их ZSTD по набору наблюдений (§F.4–F.6, §F.9).
 *
 * Одна функция и для заданий, и для персон: §F.10 требует именно этого — тот
 * же аппарат применяется к обеим осям матрицы ответов, меняется только то, по
 * чему суммируем.
 */
export function computeFit(observations: ReadonlyArray<FitObservation>): FitStats {
    let sumZ2 = 0;
    let sumSquaredResidual = 0;
    let sumVariance = 0;
    // Накопители дисперсий самих MNSQ — для ZSTD (§F.9).
    let outfitVarianceSum = 0;   // Σ (1/W − 4)
    let infitVarianceSum = 0;    // Σ (W − 4W²)
    let counted = 0;

    for (const o of observations) {
        if (!Number.isFinite(o.theta) || !Number.isFinite(o.difficulty)) continue;
        const p = probability(o.theta, o.difficulty);
        const w = p * (1 - p);
        if (w < MIN_VARIANCE) continue;
        const residual = o.correct - p;

        sumZ2 += (residual * residual) / w;
        sumSquaredResidual += residual * residual;
        sumVariance += w;
        outfitVarianceSum += 1 / w - 4;
        infitVarianceSum += w - 4 * w * w;
        counted++;
    }

    if (counted === 0) {
        return { infit: null, outfit: null, infitZstd: null, outfitZstd: null, observations: 0 };
    }

    const outfit = sumZ2 / counted;
    const infit = sumVariance > 0 ? sumSquaredResidual / sumVariance : null;

    // Var(Outfit) = (1/N²)·Σ(1/W − 4); Var(Infit) = Σ(W − 4W²)/(ΣW)².
    // Слагаемые могут дать отрицательную сумму на вырожденных наборах (при
    // W > 1/4 член W − 4W² отрицателен), и тогда ZSTD не определён — возвращаем
    // null, а не корень из отрицательного числа.
    const outfitVariance = outfitVarianceSum / (counted * counted);
    const infitVariance = sumVariance > 0 ? infitVarianceSum / (sumVariance * sumVariance) : 0;

    return {
        infit,
        outfit,
        infitZstd: infit === null ? null : mnsqToZstd(infit, infitVariance),
        outfitZstd: mnsqToZstd(outfit, outfitVariance),
        observations: counted,
    };
}

/**
 * §F.11: point-measure correlation — корреляция балла за задание с общей мерой
 * θ, обычный коэффициент Пирсона по тем, кто это задание отвечал.
 *
 * Должна быть положительной: если задание меряет ту же способность, то более
 * способные решают его чаще. Отрицательная означает обратное — те, кто сильнее
 * по тесту в целом, чаще отвечают на это задание НЕВЕРНО. Самая частая причина
 * — перепутанный ключ (§221).
 *
 * null, когда считать нечего: меньше двух наблюдений или нулевая дисперсия по
 * одной из осей (все ответили одинаково — тогда корреляции не существует, и
 * возвращать ноль значило бы выдать «нет связи» за факт).
 */
export function pointMeasureCorrelation(
    pairs: ReadonlyArray<{ score: number; theta: number }>,
): number | null {
    const usable = pairs.filter((p) => Number.isFinite(p.score) && Number.isFinite(p.theta));
    if (usable.length < 2) return null;

    const n = usable.length;
    const meanScore = usable.reduce((a, p) => a + p.score, 0) / n;
    const meanTheta = usable.reduce((a, p) => a + p.theta, 0) / n;

    let covariance = 0;
    let varianceScore = 0;
    let varianceTheta = 0;
    for (const p of usable) {
        const ds = p.score - meanScore;
        const dt = p.theta - meanTheta;
        covariance += ds * dt;
        varianceScore += ds * ds;
        varianceTheta += dt * dt;
    }
    if (varianceScore <= 0 || varianceTheta <= 0) return null;
    return covariance / Math.sqrt(varianceScore * varianceTheta);
}

export type FitFlag =
    /** MNSQ выше 1.5: шум, угадывание, ошибка ключа, многомерность (§F.8). Опаснее для измерения. */
    | "MISFIT_UNDERFIT"
    /** MNSQ ниже 0.5: ответы «слишком предсказуемы» — зависимость или дублирование (§F.8). */
    | "MISFIT_OVERFIT"
    /** Отрицательная point-measure: подозрение на ошибку ключа (§F.11, §221). */
    | "NEGATIVE_POINT_MEASURE"
    /** Положительная, но статистически неотличимая от нуля — задание почти не различает (§F.11). */
    | "WEAK_POINT_MEASURE"
    /** Наблюдений слишком мало, чтобы судить о fit вообще. */
    | "TOO_FEW_OBSERVATIONS";

// Меньше этого числа наблюдений MNSQ не интерпретируется: при N = 3 разброс
// самой статистики больше, чем расстояние от 1.0 до границ диапазона, и любой
// вывод был бы о шуме, а не о задании.
export const MIN_FIT_OBSERVATIONS = 10;

export type FitReport = FitStats & {
    /** §F.11. null — корреляции не существует, см. pointMeasureCorrelation. */
    pointMeasure: number | null;
    flags: FitFlag[];
    /**
     * §F.8: сторона отклонения. Underfit опаснее для измерения, чем overfit,
     * и методисту это нужно знать сразу.
     */
    misfitDirection: "UNDERFIT" | "OVERFIT" | null;
};

/**
 * Сводка по ОДНОМУ заданию: fit, point-measure и флаги.
 *
 * `theta` в наблюдениях — мера способности отвечавшего; она берётся готовой и
 * НЕ пересчитывается: оценка θ и диагностика — разные шаги.
 *
 * Задание НЕ исключается и НЕ помечается недействительным: §224 требует
 * пометить и оставить решение человеку, а §222–223 говорят то же про
 * зависимость и DIF.
 */
export function itemFitReport(observations: ReadonlyArray<FitObservation>): FitReport {
    const stats = computeFit(observations);
    const pointMeasure = pointMeasureCorrelation(
        observations.map((o) => ({ score: o.correct, theta: o.theta })),
    );
    return { ...stats, pointMeasure, ...classify(stats, pointMeasure) };
}

/**
 * Сводка по ОДНОЙ персоне (§F.10, §N.1).
 *
 * point-measure для персоны не считается: §F.11 определяет её как корреляцию
 * балла за ЗАДАНИЕ с мерой способности, и переносить это на строку персоны
 * значило бы придумать статистику, которой в норме нет. Поэтому здесь null.
 *
 * Высокий Outfit персоны — аномальный паттерн (лёгкие неверно, трудные верно).
 * Это ФЛАГ на просмотр, а не вердикт: §N.2 прямо говорит, что модель Раша
 * списывание не детектит.
 */
export function personFitReport(observations: ReadonlyArray<FitObservation>): FitReport {
    const stats = computeFit(observations);
    return { ...stats, pointMeasure: null, ...classify(stats, null) };
}

function classify(
    stats: FitStats,
    pointMeasure: number | null,
): { flags: FitFlag[]; misfitDirection: "UNDERFIT" | "OVERFIT" | null } {
    const flags: FitFlag[] = [];
    let misfitDirection: "UNDERFIT" | "OVERFIT" | null = null;

    if (stats.observations < MIN_FIT_OBSERVATIONS) {
        flags.push("TOO_FEW_OBSERVATIONS");
    } else {
        // Смотрим на оба MNSQ: Infit ловит внутренние несоответствия, Outfit —
        // выбросы, и задание может выйти за диапазон по любому из них (§F.4–F.5).
        const values = [stats.infit, stats.outfit].filter((v): v is number => v !== null);
        if (values.some((v) => v > MISFIT_HIGH)) {
            flags.push("MISFIT_UNDERFIT");
            misfitDirection = "UNDERFIT";
        } else if (values.some((v) => v < MISFIT_LOW)) {
            flags.push("MISFIT_OVERFIT");
            misfitDirection = "OVERFIT";
        }
    }

    if (pointMeasure !== null) {
        if (pointMeasure < 0) {
            // Флаг ставится независимо от размера выборки, и это осознанно
            // асимметрично: на малой выборке сам ЗНАК корреляции ненадёжен, но
            // цена пропуска перепутанного ключа — неверный балл у всех, кто
            // отвечал, а цена ложного флага — один просмотр методистом.
            // Поэтому флаг означает «проверить ключ», а не «ключ неверен».
            flags.push("NEGATIVE_POINT_MEASURE");
        } else if (stats.observations >= MIN_FIT_OBSERVATIONS
            // «Около нуля» — не магический порог, а отсутствие значимости:
            // при ρ = 0 стандартная ошибка корреляции ≈ 1/√(N−1), и всё, что
            // ближе 1.96 SE к нулю, от нуля неотличимо. Порог сам сжимается с
            // ростом выборки, а не остаётся выдуманной константой.
            && pointMeasure < 1.96 / Math.sqrt(Math.max(1, stats.observations - 1))) {
            flags.push("WEAK_POINT_MEASURE");
        }
    }

    return { flags, misfitDirection };
}
