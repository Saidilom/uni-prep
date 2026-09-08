// Официальный критерий оценивания сочинения по родному языку.
//
// ИСТОЧНИК — не пересказ и не реконструкция: документ лежит в репозитории,
// tests-pdf/узб/ona_tili_yozma_2025_yangi.pdf, «UMUMTA'LIM FANLARINI BILISH
// DARAJASINI BAHOLASHNING MILLIY TEST TIZIMI DOIRASIDA ONA TILI VA ADABIYOT
// FANIDAN ... YOZMA ISH (ESSE)NI BAHOLASH MEZONI».
//
// ═══ ЧТО В ДОКУМЕНТЕ, А ЧТО ПРЕДПОЛАГАЛОСЬ ═══
//
// Предполагалось: 12 критериев по шкале 0/1/2.
// В документе:    12 критериев по шкале 2 / 1,5 / 1 / 0,5 / 0 — ПЯТЬ уровней.
//
// Итог тот же — «JAMI: 24 BALL», 12 × 2 = 24, — но уровней внутри критерия не
// три, а пять. Реализовано по документу: форма с тремя уровнями не смогла бы
// выразить официальный критерий, и половина оценок округлялась бы вслепую.
//
// Разница важна и дальше: каждый критерий становится политомным заданием на
// ПЯТЬ категорий, а не на три. Это по-прежнему несравнимо лучше, чем одно
// задание на 25 категорий, но требование к числу наблюдений выше.
//
// ═══ СТРУКТУРА ═══
//
// 12 критериев сгруппированы в 5 разделов — так они и напечатаны в документе.
// Нумерация 1–12 сохранена: по ней потом сверять с бумагой.
//
// ═══ ЧЕГО ЗДЕСЬ НЕТ ═══
//
// Модели. Это описание инструмента оценивания и арифметика суммы, ничего
// больше: ни θ, ни шкалы, ни порогов уровня.

/** Максимум за сочинение: 12 критериев × 2 балла. Совпадает с «JAMI: 24 BALL». */
export const ESSAY_MAX_POINTS = 24;

/** Уровни внутри одного критерия, от полного к нулевому — как в документе. */
export const CRITERION_LEVELS = [2, 1.5, 1, 0.5, 0] as const;
export type CriterionLevel = (typeof CRITERION_LEVELS)[number];

export type RubricGroup =
    | "TASK"        // TOPSHIRIQ TALABLARINING BAJARILGANLIGI
    | "INTEGRITY"   // MATN YAXLITLIGI
    | "LITERACY"    // SAVODXONLIK
    | "STYLE"       // TIL BIRLIKLARI USLUBIYATI
    | "VOCABULARY"; // LUG'AT BOYLIGI

export type RubricCriterion = {
    /** Номер в документе, 1–12. Не индекс массива — по нему сверяют с бумагой. */
    index: number;
    group: RubricGroup;
    /** Ключ перевода названия критерия (src/lib/i18n/dictionaries). */
    labelKey: string;
};

/**
 * Двенадцать критериев в порядке документа.
 *
 * Тексты названий держатся в словарях, а не здесь: экран проверки двуязычный,
 * а сам документ на узбекском. Тут — только структура и нумерация.
 */
// `satisfies`, а не аннотация типа: аннотация расширила бы labelKey до string,
// и опечатка в ключе перевода перестала бы быть ошибкой сборки.
export const ESSAY_CRITERIA = [
    // TOPSHIRIQ TALABLARINING BAJARILGANLIGI — выполнение требований задания
    { index: 1, group: "TASK", labelKey: "essayCriterion1" },
    { index: 2, group: "TASK", labelKey: "essayCriterion2" },
    { index: 3, group: "TASK", labelKey: "essayCriterion3" },
    // MATN YAXLITLIGI — целостность текста
    { index: 4, group: "INTEGRITY", labelKey: "essayCriterion4" },
    { index: 5, group: "INTEGRITY", labelKey: "essayCriterion5" },
    { index: 6, group: "INTEGRITY", labelKey: "essayCriterion6" },
    // SAVODXONLIK — грамотность
    { index: 7, group: "LITERACY", labelKey: "essayCriterion7" },
    { index: 8, group: "LITERACY", labelKey: "essayCriterion8" },
    // TIL BIRLIKLARI USLUBIYATI — стилистика языковых единиц
    { index: 9, group: "STYLE", labelKey: "essayCriterion9" },
    { index: 10, group: "STYLE", labelKey: "essayCriterion10" },
    // LUG'AT BOYLIGI — богатство словаря
    { index: 11, group: "VOCABULARY", labelKey: "essayCriterion11" },
    { index: 12, group: "VOCABULARY", labelKey: "essayCriterion12" },
] as const satisfies readonly RubricCriterion[];

export const RUBRIC_GROUP_ORDER: readonly RubricGroup[] = [
    "TASK", "INTEGRITY", "LITERACY", "STYLE", "VOCABULARY",
];

/** Ключ перевода заголовка раздела. */
export const RUBRIC_GROUP_LABEL_KEY = {
    TASK: "essayGroupTask",
    INTEGRITY: "essayGroupIntegrity",
    LITERACY: "essayGroupLiteracy",
    STYLE: "essayGroupStyle",
    VOCABULARY: "essayGroupVocabulary",
} as const satisfies Record<RubricGroup, string>;

/** Оценка по одному критерию. */
export type CriterionScore = { index: number; score: number };

export function isCriterionLevel(value: number): value is CriterionLevel {
    return (CRITERION_LEVELS as readonly number[]).includes(value);
}

export type RubricValidation =
    | { ok: true; total: number }
    | { ok: false; reason: string };

/**
 * Проверка полного набора оценок и подсчёт суммы.
 *
 * Сумма — это и есть сырой балл за сочинение: документ не даёт никакого
 * пересчёта, там прямо «JAMI: 24 BALL» под таблицей из двенадцати строк.
 *
 * Набор обязан быть ПОЛНЫМ. Частичный — это не «часть работы проверена», а
 * оценка, которой не существует: пропущенный критерий нельзя молча считать
 * нулём (это занизило бы балл) и нельзя считать двойкой (завысило бы).
 */
export function validateCriterionScores(scores: readonly CriterionScore[]): RubricValidation {
    const byIndex = new Map<number, number>();
    for (const item of scores) {
        if (!Number.isFinite(item.score) || !isCriterionLevel(item.score)) {
            return { ok: false, reason: `Критерий ${item.index}: оценка ${item.score} не из шкалы 2 / 1,5 / 1 / 0,5 / 0` };
        }
        if (byIndex.has(item.index)) {
            return { ok: false, reason: `Критерий ${item.index} оценён дважды` };
        }
        byIndex.set(item.index, item.score);
    }
    for (const criterion of ESSAY_CRITERIA) {
        if (!byIndex.has(criterion.index)) {
            return { ok: false, reason: `Не оценён критерий ${criterion.index}` };
        }
    }
    if (byIndex.size !== ESSAY_CRITERIA.length) {
        return { ok: false, reason: `Ожидается ${ESSAY_CRITERIA.length} критериев, пришло ${byIndex.size}` };
    }
    return { ok: true, total: sumCriterionScores(scores) };
}

/**
 * Сумма оценок. Считается в десятых и делится обратно: 0,5 в двоичной дроби
 * представляется точно, но сумма двенадцати таких значений накапливает мусор
 * вида 18.000000000000004, и он утёк бы в балл.
 */
export function sumCriterionScores(scores: readonly CriterionScore[]): number {
    const tenths = scores.reduce((acc, item) => acc + Math.round(item.score * 10), 0);
    return tenths / 10;
}

/**
 * Особые случаи из документа — их проверяющий выставляет НЕ по критериям.
 *
 * «Esse quyidagi hollarda tekshirilmaydi va 2 ball bilan baholanadi»:
 * работа не проверяется и получает 2 балла, если написана не на тему, короче
 * 100 слов или списана. «Esse yozilmagan bo'lsa, 0 ball beriladi» — не
 * написана вовсе, ноль.
 *
 * Это не оценка по критериям, а решение вместо неё, поэтому оно и живёт
 * отдельным типом: иначе двойка «не на тему» была бы неотличима от двойки,
 * набранной по критериям, и в PCM попала бы как обычное наблюдение.
 */
export type EssayVerdict =
    | { kind: "SCORED"; scores: CriterionScore[] }
    | { kind: "NOT_CHECKED"; reason: "OFF_TOPIC" | "TOO_SHORT" | "PLAGIARISM" }
    | { kind: "NOT_WRITTEN" };

/** Балл по вердикту: 2 у непроверяемой работы, 0 у ненаписанной, сумма у обычной. */
export function essayPointsFromVerdict(verdict: EssayVerdict): number {
    if (verdict.kind === "NOT_WRITTEN") return 0;
    if (verdict.kind === "NOT_CHECKED") return 2;
    return sumCriterionScores(verdict.scores);
}
