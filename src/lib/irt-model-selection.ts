// Автовыбор модели балла (1PL/2PL/3PL) по числу сдавших.
//
// Решение владельца от 2026-09-17 (design/RASCH.md, «ДЕЙСТВУЮЩИЙ РАСЧЁТ»
// пункт 3, Часть V.4): вместо одной зафиксированной модели на всех — система
// сама выбирает модель по тому, сколько учеников реально сдало тест.
//
// ═══ КАК 1PL И 2PL ПОЛУЧЕНЫ ПОЧТИ БЕЗ НОВОГО КОДА ═══
//
// probability3pl(θ,{a,b,c}) = c + (1−c)·logistic(D·a·(θ−b)), D = SCALING_D =
// 1.702. При c=0 и a = 1/D: D·a·(θ−b) = (θ−b) — формула АЛГЕБРАИЧЕСКИ ТОЧНО
// вырождается в классический Rasch logistic(θ−b), и itemInformation3pl —
// точно в P(1−P). Проверено и алгеброй, и тестом irt-model-selection.test.ts
// (сравнение с rasch.ts на одних данных, допуск 1e-9). Значит estimateTheta3pl
// (единственная оценка θ в проекте — MAP по Ньютону, с SE и статусами
// сходимости) обслуживает ВСЕ три модели: разница только во входных {a,b,c}.
//
// 2PL получается из уже существующего в irt-3pl-calibration.ts механизма
// fixedC: если item.optionCount не передан (null), c стартует в 0 и градиент
// gc навсегда зануляется — угадывание не оценивается. Сейчас это применяется
// только к заданиям со свободным ответом; передав optionCount: null для ВСЕХ
// заданий, получаем честный 2PL (свободные a,b, c=0) без новой калибровки.
//
// Калибровка `b` для 1PL — отдельный алгоритм, estimateRasch (JMLE,
// rasch.ts), уже протестирован и уже в проде (CEFR английский). Намеренно НЕ
// объединяю его с байесовским MMLE/EM 3PL-калибратора — это два разных, оба
// нетривиальных, оба независимо проверенных метода.

import { estimateRasch, type Observation } from "./rasch";
import { calibrate3pl, type CalibrationItemInput, type CalibratedItem } from "./irt-3pl-calibration";
import { estimateTheta3pl, probability3pl, itemInformation3pl, SCALING_D, type Item3pl, type Theta3plResult } from "./irt-3pl";

export type ModelType = "RASCH_1PL" | "IRT_2PL" | "IRT_3PL";

/**
 * Единственное значение a, при котором D·a·(θ−b) = (θ−b) — то есть 3PL-формула
 * точно совпадает с классическим Rasch. Не "оценённая дискриминация", а
 * технический переходник, позволяющий переиспользовать estimateTheta3pl.
 */
export const RASCH_EQUIVALENT_A = 1 / SCALING_D;

export const MODEL_VERSION: Record<ModelType, string> = {
    RASCH_1PL: "1pl-jmle-1.0",
    IRT_2PL: "2pl-map-1.0",
    IRT_3PL: "3pl-map-1.1",
};

export const DIFFICULTY_METHOD: Record<ModelType, string> = {
    RASCH_1PL: "1PL_JMLE",
    IRT_2PL: "2PL_MMLE",
    IRT_3PL: "3PL_MMLE",
};

export const PERSON_ESTIMATOR: Record<ModelType, string> = {
    // Калибровка для 1PL — JMLE, но оценка θ ученику (то, что реально пишется
    // в mock_results) — тот же MAP-Ньютон, что у 2PL/3PL: см. шапку файла.
    RASCH_1PL: "JMLE_NEWTON_1PL",
    IRT_2PL: "MAP_NEWTON_2PL",
    IRT_3PL: "MAP_NEWTON_3PL",
};

// Пороги — design/RASCH.md, «ДЕЙСТВУЮЩИЙ РАСЧЁТ» пункт 3 и Часть V.4:
// 1PL — один параметр b, ориентир E.8 (≥250–300 наблюдений на задание).
// 3PL — три параметра, литературный ориентир ~1000/задание (шапка irt-3pl.ts).
// 2PL — два параметра, между ними.
// Сознательно НЕ подогнаны под сегодняшний трафик платформы (36–54 сдавших).
export const MIN_N_FOR_2PL = 300;
export const MIN_N_FOR_3PL = 1000;

const TIER_ORDER: Record<ModelType, number> = { RASCH_1PL: 0, IRT_2PL: 1, IRT_3PL: 2 };

/** Модель, соответствующая N сдавших, без учёта истории. */
export function tierForN(n: number): ModelType {
    if (n >= MIN_N_FOR_3PL) return "IRT_3PL";
    if (n >= MIN_N_FOR_2PL) return "IRT_2PL";
    return "RASCH_1PL";
}

/**
 * Храповик: модель растёт вместе с когортой, но сама не понижается при
 * уменьшении N (например, при удалении попытки админом) — иначе N у границы
 * порога (299/300) дёргал бы модель между сдачами. Повышение — сразу при
 * пересечении порога, вплоть до пропуска ступени.
 */
export function selectModel(n: number, previousModelType: ModelType | null): ModelType {
    const naive = tierForN(n);
    if (previousModelType && TIER_ORDER[previousModelType] > TIER_ORDER[naive]) return previousModelType;
    return naive;
}

/**
 * Выбор модели для теста с учётом того, ОТКУДА взялась сохранённая модель.
 *
 * Храповик держит только модель, которую выбрал этот диспетчер (у неё
 * записан model_sample_size). Модель, проставленная бэкфиллом миграции 124
 * (model_type = 'IRT_3PL', model_sample_size = NULL), — не решение по N, а
 * пометка «чем считали до автовыбора»: удерживай её храповик, тесты с 36–54
 * сдавшими навсегда остались бы на 3PL вопреки порогам.
 *
 * modelChanged сравнивает с сохранённой моделью независимо от её
 * происхождения: θ в любом случае переходит в другую метрику, и заморозку
 * μ/σ надо снять.
 */
export function selectModelForTest(
    n: number,
    stored: { modelType: ModelType | null; sampleSize: number | null },
): { modelType: ModelType; previousModelType: ModelType | null; modelChanged: boolean } {
    const ratchetFrom = stored.sampleSize !== null ? stored.modelType : null;
    const modelType = selectModel(n, ratchetFrom);
    return {
        modelType,
        previousModelType: stored.modelType,
        modelChanged: stored.modelType !== null && stored.modelType !== modelType,
    };
}

/**
 * Направление смены модели для причины ревизии: UPGRADE — выше по ступени,
 * SELECTED — любая другая смена (первый выбор после бэкфилла, в том числе
 * вниз с 3PL), null — модель та же.
 */
export function modelTransition(previous: ModelType | null, next: ModelType): "UPGRADE" | "SELECTED" | null {
    if (previous === null || previous === next) return null;
    return TIER_ORDER[next] > TIER_ORDER[previous] ? "UPGRADE" : "SELECTED";
}

export type ModelCalibration = {
    modelType: ModelType;
    /** Те же поля, что у 3PL-калибровки (a,b,c,cPrior,sampleSize,...) — единый формат для записи в БД независимо от модели. */
    items: CalibratedItem[];
    converged: boolean;
    iterations: number;
    estimateTheta: (examRow: ReadonlyArray<0 | 1>) => Theta3plResult;
    probability: (theta: number, itemIndex: number) => number;
    itemInformation: (theta: number, itemIndex: number) => number;
};

function calibratedStatus(answered: number, correct: number): CalibratedItem["status"] {
    if (answered === 0) return "NO_RESPONSES";
    if (correct === 0) return "NONE_CORRECT";
    if (correct === answered) return "ALL_CORRECT";
    return "OK";
}

/**
 * Калибрует задания и возвращает единый интерфейс (оценка θ, вероятность,
 * информация), которым дальше пользуется /api/rasch/recalculate независимо
 * от того, какая модель выбрана.
 */
export function calibrateModel(
    modelType: ModelType,
    itemsInput: readonly CalibrationItemInput[],
): ModelCalibration {
    let items3pl: Item3pl[];
    let converged: boolean;
    let iterations: number;
    let calibratedItems: CalibratedItem[];

    if (modelType === "RASCH_1PL") {
        const itemCount = itemsInput.length;
        const personCount = itemCount > 0 ? itemsInput[0].responses.length : 0;
        const observations: Observation[] = [];
        itemsInput.forEach((item, i) => {
            item.responses.forEach((r, p) => {
                if (r !== null) observations.push({ person: p, item: i, correct: r });
            });
        });
        const result = estimateRasch(observations, personCount, itemCount);
        items3pl = result.itemDifficulty.map((b) => ({ a: RASCH_EQUIVALENT_A, b, c: 0 }));
        converged = result.converged;
        iterations = result.iterations;
        calibratedItems = items3pl.map((item, i) => {
            const responses = itemsInput[i].responses;
            let answered = 0;
            let correct = 0;
            for (const value of responses) {
                if (value === null) continue;
                answered++;
                correct += value;
            }
            return {
                ...item,
                cPrior: 0,
                sampleSize: answered,
                correctCount: correct,
                status: calibratedStatus(answered, correct),
            };
        });
    } else {
        // 2PL — тот же MMLE/EM, что и 3PL, но c закреплён нулём у ВСЕХ заданий
        // (existующий механизм fixedC, обычно применяемый только к заданиям со
        // свободным ответом — здесь распространяем его на весь пул).
        const forceFixedC = modelType === "IRT_2PL";
        const calibration = calibrate3pl(
            itemsInput.map((it) => ({
                responses: it.responses,
                optionCount: forceFixedC ? null : it.optionCount,
            })),
        );
        calibratedItems = calibration.items;
        items3pl = calibration.items.map((it) => ({ a: it.a, b: it.b, c: it.c }));
        converged = calibration.converged;
        iterations = calibration.iterations;
    }

    return {
        modelType,
        items: calibratedItems,
        converged,
        iterations,
        estimateTheta: (examRow) =>
            estimateTheta3pl(examRow.map((correct, i) => ({ correct, item: items3pl[i] }))),
        probability: (theta, i) => probability3pl(theta, items3pl[i]),
        itemInformation: (theta, i) => itemInformation3pl(theta, items3pl[i]),
    };
}
