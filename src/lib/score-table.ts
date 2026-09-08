// Таблица «сырой балл → θ → балл → уровень» для фиксированного варианта.
// ТЗ §R.6, опирается на §B.6.
//
// ═══ ПОЧЕМУ ТАБЛИЦА ВООБЩЕ ВОЗМОЖНА ═══
//
// При полных данных способность зависит ТОЛЬКО от сырого балла — это §B.6
// (достаточность сырого балла), и вот почему буквально:
//
//   U_W(θ) = Σ_i (x_i − P_i(θ)) + J(θ)/(2·I(θ))
//          = r − Σ_i P_i(θ) + J(θ)/(2·I(θ))          где r = Σ_i x_i
//
// Суммы Σ P_i, I и J считаются по СЛОЖНОСТЯМ варианта и от θ; какие именно
// задания ученик решил верно, в уравнение не входит вообще — входит только их
// число r. Значит корень уравнения один и тот же у всех, кто набрал r верных.
// То же верно и для MLE: там U(θ) = r − Σ P_i(θ).
//
// СЛЕДСТВИЕ, которое надо понимать правильно: одинаковое число верных даёт
// один и тот же балл, и это НЕ дефект и не «слипание» баллов. Это свойство
// модели Раша, ради которого её и берут: измерение не зависит от того, какие
// именно задания попались верными. На 55 заданиях возможных баллов ровно 56 —
// больше их быть не может ни при какой реализации.
//
// Чего это НЕ означает: одинаковый ПРОЦЕНТ на РАЗНЫХ вариантах не даёт
// одинаковую θ (§B.7). Таблица строится на каждый вариант отдельно, по его
// собственным сложностям, и переносить её на другой вариант нельзя.
//
// ═══ ЗАЧЕМ ОНА НУЖНА ═══
//
// Так работает и сам БМБА: балл берётся поиском по строке, а не прогоном
// модели на каждого ученика. Отсюда три свойства, которых иначе нет:
//
//   детерминированность — у одного варианта один ответ на один сырой балл,
//                         независимо от того, кто ещё сдавал и когда;
//   аудируемость        — таблицу можно показать методисту и сверить глазами;
//   объяснимость        — на вопрос «почему у них одинаковый балл» есть строка
//                         таблицы, а не рассуждение про итерации.
//
// Модель и способ оценки θ этот модуль НЕ меняет: он вызывает тот же
// estimateThetaWle, что и раньше, просто по одному разу на сырой балл вместо
// одного раза на ученика. Результат обязан совпадать бит-в-бит, и это
// проверяется тестом.

import { estimateThetaWle, WLE_ESTIMATOR, WLE_VERSION, WleStatus } from "./rasch-wle";
import { measurementPrecision, raschThetaToT, MeasurementStatus } from "./rasch";
import { ReferencePopulation } from "./reference-population";
import { tScoreToCertificate } from "./certificate-scale";
import { gradeLevelFromScore, GradeLevel } from "./mock-grade-level";

export type ScoreTableRow = {
    /** Число верных ответов. Строки идут от 0 до числа заданий включительно. */
    rawScore: number;
    /** Способность, логиты. Одна на весь сырой балл — см. §B.6 выше. */
    theta: number;
    /** Погрешность способности в этой точке (§D.4). null — измерения нет (§217). */
    thetaSe: number | null;
    /** Информация теста в этой точке (§D.3). */
    information: number;
    /** T-балл раздела Раша, 0–75. Промежуточная величина. */
    sectionScore: number;
    /**
     * Итоговый балл и уровень. Заполнены только у теста БЕЗ второго раздела:
     * при наличии сочинения итог есть среднее разделов, и по одному сырому
     * баллу его не определить (Baholash_mezoni.pdf стр. 4).
     */
    score: number | null;
    level: GradeLevel | null;
    /** Статус измерения в этой точке: OK / LOW_INFORMATION / INSUFFICIENT_INFORMATION. */
    measurementStatus: MeasurementStatus;
    /** Сошлось ли уравнение WLE в этой строке (§C.4). */
    wleStatus: WleStatus;
};

export type ScoreTable = {
    /** Число заданий варианта. Строк в таблице itemCount + 1. */
    itemCount: number;
    /** Есть ли второй раздел: если да, score и level в строках пустые. */
    hasSecondSection: boolean;
    estimator: string;
    /** Версия точки отсчёта шкалы — без неё балл невоспроизводим (§109). */
    referenceVersion: string;
    rows: ScoreTableRow[];
};

/**
 * Построение таблицы для одного варианта. Вызывается ОДИН раз на вариант, а не
 * на ученика.
 *
 * `difficulties` — калиброванные сложности заданий варианта в их порядке.
 * Модуль их не пересчитывает и не трогает: калибровка живёт отдельно (§E.1).
 */
export function buildScoreTable(
    difficulties: number[],
    reference: ReferencePopulation,
    opts: { subjectId?: string | null; hasSecondSection?: boolean } = {},
): ScoreTable {
    const itemCount = difficulties.length;
    const hasSecondSection = opts.hasSecondSection ?? false;
    const subjectId = opts.subjectId ?? null;

    const rows: ScoreTableRow[] = [];
    for (let rawScore = 0; rawScore <= itemCount; rawScore++) {
        // Набор ответов, дающий этот сырой балл. КАКИЕ именно задания помечены
        // верными, не влияет на результат — см. вывод в шапке модуля. Берём
        // первые rawScore, потому что так строка воспроизводима.
        const responses = difficulties.map((difficulty, i) => ({
            correct: (i < rawScore ? 1 : 0) as 0 | 1,
            difficulty,
        }));
        const wle = estimateThetaWle(responses);
        const precision = measurementPrecision(wle.theta, difficulties);
        const sectionScore = raschThetaToT(wle.theta, reference.mu, reference.sigma);
        // У теста с одним разделом итог равен T, поэтому балл и уровень
        // определены уже здесь. У двухраздельного — нет, там нужен второй
        // раздел, и подставлять сюда половину было бы неверно.
        const score = hasSecondSection ? null : tScoreToCertificate(sectionScore, subjectId);

        rows.push({
            rawScore,
            theta: wle.theta,
            thetaSe: precision.thetaSe,
            information: precision.information,
            sectionScore,
            score,
            level: score === null ? null : gradeLevelFromScore(score),
            measurementStatus: precision.status,
            wleStatus: wle.status,
        });
    }

    return {
        itemCount,
        hasSecondSection,
        estimator: `${WLE_ESTIMATOR}/${WLE_VERSION}`,
        referenceVersion: reference.version,
        rows,
    };
}

/**
 * Поиск строки по сырому баллу. Именно так балл и должен получаться в проде:
 * посчитали число верных — взяли строку.
 *
 * Возвращает null на сыром балле вне диапазона: это означает, что ученик
 * отвечал не на тот вариант, для которого построена таблица, и подставлять
 * ближайшую строку тут нельзя (§233 — никакого молчаливого fallback).
 */
export function lookupScoreRow(table: ScoreTable, rawScore: number): ScoreTableRow | null {
    if (!Number.isInteger(rawScore) || rawScore < 0 || rawScore > table.itemCount) return null;
    return table.rows[rawScore] ?? null;
}
