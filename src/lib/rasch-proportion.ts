// Сложность задания из доли решивших.
//
// ═══ ЧТО ЭТО И ОТКУДА ═══
//
// Решение владельца от 2026-09-11 по документу «Что делать на платформе —
// шаг за шагом», шаг 2:
//
//   β = −ln( p / (1 − p) ),   p — доля верных ответов по заданию
//
// Раньше сложности приходили из совместной калибровки JMLE
// (`estimateRasch` в rasch.ts), и эта формула была в ней лишь СТАРТОВЫМ
// значением, которое дальше уточнялось. Теперь она сама и есть ответ.
//
// Разница на живых данных замерена перед правкой: после снятия постоянного
// сдвига наивная β совпадает с калиброванной с точностью r = 0,99 и средним
// расхождением 0,14 логита. То есть на ОДНОМ варианте с полными данными
// разница невелика; расходятся они там, где сравнивают разные варианты или
// работают с неполными данными.
//
// ═══ ПОЧЕМУ СДВИГ НЕ ВЫРАВНИВАЕТСЯ ═══
//
// JMLE центрировал сложности на нуле (`mean(b) = 0`), здесь этого нет:
// документ такого шага не содержит. Постоянный сдвиг в β целиком переходит в
// θ — обе величины уезжают вместе, поэтому карта «ученики против заданий»
// остаётся согласованной, — а на балл он не влияет вовсе: Z-стандартизация по
// потоку вычитает μ и любой общий сдвиг уходит с ней.
//
// ═══ КРАЙНИЕ ДОЛИ ═══
//
// В самой формуле их нет, и это не мелочь: на боевом моке по математике
// 5 заданий из 55 не решил НИКТО (p = 0), на Ona Tili таких 3 из 50. Голая
// формула даёт на них +Infinity и обрывает расчёт всего теста.
//
// Поправка та же, что принята в модели Раша для крайних баллов (Wright &
// Panchapakesan, 1969): наблюдаемое число сдвигается на 0,3 внутрь диапазона.
// Задание остаётся на шкале как «очень трудное», а не выпадает из расчёта.

/** На сколько сдвигать число верных, когда оно упёрлось в край. */
export const EXTREME_ADJUSTMENT = 0.3;

export type ItemCounts = {
    /** Сколько человек ответили верно. */
    correct: number;
    /** Сколько человек вообще отвечали (пропуски сюда не входят, §A.3). */
    responses: number;
};

export type DifficultyStatus =
    /** Обычное задание: доля строго между нулём и единицей. */
    | "OK"
    /** Не решил никто — доля поднята поправкой. */
    | "NONE_CORRECT"
    /** Решили все — доля опущена поправкой. */
    | "ALL_CORRECT"
    /** Задание никому не предъявлялось: считать не из чего. */
    | "NO_RESPONSES";

export type ProportionDifficulty = {
    /** β в логитах. NaN только при NO_RESPONSES. */
    difficulty: number;
    /** Доля верных как есть, до поправки. NaN при NO_RESPONSES. */
    proportion: number;
    /** Доля, по которой фактически посчитана β. */
    adjustedProportion: number;
    status: DifficultyStatus;
};

/**
 * Сложность одного задания.
 *
 * Отдельной функцией, чтобы решение «что считать крайним случаем» можно было
 * проверить тестом без матрицы ответов и без базы.
 */
export function proportionDifficulty(counts: ItemCounts): ProportionDifficulty {
    const responses = Math.max(0, Math.trunc(counts.responses));
    const correct = Math.max(0, counts.correct);

    if (responses <= 0) {
        // Ни одного ответа. Подставить сюда «среднюю» сложность значило бы
        // выдумать данные (§233): у задания нет ни одного наблюдения, и
        // вызывающий обязан решить это сам, а не получить правдоподобное число.
        return { difficulty: NaN, proportion: NaN, adjustedProportion: NaN, status: "NO_RESPONSES" };
    }

    const proportion = correct / responses;
    let adjustedCorrect = correct;
    let status: DifficultyStatus = "OK";
    if (correct <= 0) {
        adjustedCorrect = EXTREME_ADJUSTMENT;
        status = "NONE_CORRECT";
    } else if (correct >= responses) {
        adjustedCorrect = responses - EXTREME_ADJUSTMENT;
        status = "ALL_CORRECT";
    }

    const adjustedProportion = adjustedCorrect / responses;
    // У ровно половины решивших получается −0: минус перед ln(1). Значение
    // верное, но «−0» в базе и на экране выглядит ошибкой, а сравнения вида
    // Object.is(x, 0) на нём ломаются. Прибавление нуля переводит −0 в 0 и
    // больше ничего не меняет.
    const difficulty = -Math.log(adjustedProportion / (1 - adjustedProportion)) + 0;
    return { difficulty, proportion, adjustedProportion, status };
}

/** То же по всем заданиям варианта, в их порядке. */
export function proportionDifficulties(items: readonly ItemCounts[]): ProportionDifficulty[] {
    return items.map(proportionDifficulty);
}

/**
 * Среднее и разброс θ потока — шаги 5–6 документа.
 *
 * Отдельно от `mean`/`stdev` в rasch.ts не из-за формул, а из-за СТАТУСА:
 * поток, который не даёт разброса, — обычное дело (один сдавший; все решили
 * одинаково), и вызывающий обязан отличить его от посчитанного, а не получить
 * молча ноль или NaN без объяснения.
 */
export type CohortStatus = "OK" | "TOO_FEW" | "NO_SPREAD";

export type CohortStatistics = {
    mu: number;
    sigma: number;
    count: number;
    status: CohortStatus;
};

export function cohortStatistics(thetas: readonly number[]): CohortStatistics {
    const finite = thetas.filter((theta) => Number.isFinite(theta));
    const count = finite.length;
    if (count < 2) {
        // Одному человеку не с кем сравниваться. Именно это и означает
        // центрирование по потоку: балл существует только у группы.
        const mu = count === 1 ? finite[0] : NaN;
        return { mu, sigma: NaN, count, status: "TOO_FEW" };
    }
    const mu = finite.reduce((sum, theta) => sum + theta, 0) / count;
    // Выборочное отклонение (делитель n−1): поток — это выборка, а не вся
    // генеральная совокупность.
    const variance = finite.reduce((sum, theta) => sum + (theta - mu) ** 2, 0) / (count - 1);
    const sigma = Math.sqrt(variance);
    if (!(sigma > 0)) {
        return { mu, sigma: NaN, count, status: "NO_SPREAD" };
    }
    return { mu, sigma, count, status: "OK" };
}
