// Separation и reliability. ТЗ §N.5 (= разделы 117–119).
//
// ═══ ЧТО ЭТО ЗА ЧИСЛА ═══
//
//   Separation G  = SD_true / RMSE(SE)
//   Reliability   = G² / (1 + G²)
//
// Separation отвечает на вопрос «во сколько раз настоящий разброс людей больше
// погрешности, которой мы их меряем». Reliability — тот же ответ, пересчитанный
// в привычную шкалу 0…1 (аналог KR-20 и альфы Кронбаха, §N.5).
//
// Смысл прямой: если тест не различает учеников точнее, чем сам ошибается,
// separation около единицы, а reliability около 0.5 — и балл почти не несёт
// информации о том, кто сильнее.
//
// ═══ ОТКУДА БЕРЁТСЯ SD_true ═══
//
// Наблюдаемый разброс оценок шире настоящего: к настоящему разбросу людей
// добавляется разброс от погрешности измерения. Их и разделяют:
//
//   MSE       = среднее SE²          (квадрат RMSE)
//   SD_true²  = SD_наблюдаемое² − MSE
//
// Отсюда и главный крайний случай: если наблюдаемый разброс НЕ больше
// погрешности, SD_true² выходит отрицательным. Корня из него не существует, и
// подставить туда ноль нельзя — это выглядело бы как «разброс есть, просто
// маленький», тогда как правильный ответ «весь наблюдаемый разброс объясняется
// ошибкой измерения». §217 требует в таком случае вернуть статус, а не число.
//
// ═══ СТРАТЫ ═══
//
// §N.5 определяет person separation как «на сколько статистически различимых
// уровней тест делит учеников». Само G — это отношение, а не число уровней;
// уровни считаются по общепринятой формуле
//
//   strata = (4G + 1) / 3
//
// Она и отвечает на вопрос спеки словами, понятными методисту: «тест делит
// когорту на два с половиной различимых уровня» читается, а «G = 1.4» — нет.

import { mean } from "./rasch";

/** Ориентир для высоких ставок: §N.5 называет 0.8–0.9. */
export const RELIABILITY_HIGH_STAKES = 0.8;

export type SeparationStatus =
    | "OK"
    /** Наблюдаемый разброс не превышает погрешность: SD_true не существует. */
    | "NOT_SEPARABLE"
    /** Меньше двух оценок с погрешностью — считать не из чего. */
    | "TOO_FEW";

export type SeparationResult = {
    /** Сколько оценок вошло в расчёт. */
    count: number;
    /** Разброс самих оценок (θ или b), логиты. */
    sdObserved: number | null;
    /** Корень из среднего квадрата погрешностей. */
    rmse: number | null;
    /** Разброс, очищенный от погрешности. null — когда не существует. */
    sdTrue: number | null;
    /** G = SD_true / RMSE. */
    separation: number | null;
    /** G²/(1+G²), от 0 до 1. */
    reliability: number | null;
    /** (4G+1)/3 — сколько различимых уровней (§N.5). */
    strata: number | null;
    status: SeparationStatus;
};

const EMPTY = (count: number, status: SeparationStatus): SeparationResult => ({
    count, sdObserved: null, rmse: null, sdTrue: null,
    separation: null, reliability: null, strata: null, status,
});

/**
 * Separation и reliability по набору оценок с их погрешностями.
 *
 * Годится и для персон (θ и SE(θ)), и для заданий (b и SE(b)) — §N.5 определяет
 * обе через одну формулу, меняется только то, что подставляют.
 *
 * ЧТО СЮДА ПОДАВАТЬ. Оценки с крайними сырыми баллами (0 верных или все
 * верные) имеют огромную SE — у нашего ученика с нулём верных она 1.84 логиты
 * против 0.32 у остальных. Одна такая оценка заметно раздувает RMSE и роняет
 * reliability. Отфильтровать их или нет — решение вызывающего: функция считает
 * то, что дали, и сообщает, сколько взяла.
 */
export function computeSeparation(
    estimates: ReadonlyArray<{ measure: number; se: number | null }>,
): SeparationResult {
    const usable = estimates.filter(
        (e) => Number.isFinite(e.measure) && e.se !== null && Number.isFinite(e.se) && e.se > 0,
    ) as Array<{ measure: number; se: number }>;

    if (usable.length < 2) return EMPTY(usable.length, "TOO_FEW");

    const measures = usable.map((e) => e.measure);
    const m = mean(measures);
    // Разброс по выборке (делим на n), тот же способ, что у stdev в rasch.ts.
    const varianceObserved = mean(measures.map((x) => (x - m) ** 2));
    const sdObserved = Math.sqrt(varianceObserved);

    const mse = mean(usable.map((e) => e.se ** 2));
    const rmse = Math.sqrt(mse);

    const varianceTrue = varianceObserved - mse;
    if (!(varianceTrue > 0)) {
        // Весь наблюдаемый разброс объясняется погрешностью. Подставить ноль
        // значило бы выдать «различает плохо» за «не различает вовсе».
        return { ...EMPTY(usable.length, "NOT_SEPARABLE"), sdObserved, rmse };
    }

    const sdTrue = Math.sqrt(varianceTrue);
    const separation = sdTrue / rmse;

    return {
        count: usable.length,
        sdObserved,
        rmse,
        sdTrue,
        separation,
        reliability: (separation ** 2) / (1 + separation ** 2),
        strata: (4 * separation + 1) / 3,
        status: "OK",
    };
}

/** Дотягивает ли надёжность до ориентира высоких ставок (§N.5). */
export function meetsHighStakes(result: SeparationResult): boolean {
    return result.reliability !== null && result.reliability >= RELIABILITY_HIGH_STAKES;
}
