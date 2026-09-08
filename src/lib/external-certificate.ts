// Внешний сертификат БМБА — то, что ученик получил на НАСТОЯЩЕМ экзамене.
//
// ЗАЧЕМ. Привязка нашей шкалы к шкале БМБА (§R) выводится только эмпирически:
// нужны пары «наш θ ↔ реальный балл сертификата» по 100–150 учеников на
// предмет (§R.2). Сейчас про реальные сертификаты в базе нет ничего — поиск по
// всей схеме дал ноль колонок. Пока их негде хранить, §R.3 нечем считать, а
// A_scale = 10 и B_scale = 50 остаются заглушкой.
//
// Этот модуль — только описание и проверка данных. Ни линкинга, ни изменения
// формулы θ → балл здесь нет и быть не должно.
//
// ═══ ЧТО ЗДЕСЬ ВАЖНО ПОНИМАТЬ ═══
//
// Это ЗАЯВЛЕНИЕ о государственном документе, а не наше измерение. Поэтому у
// записи есть источник (кто внёс) и статус доверия (проверено ли), и по
// умолчанию доверие нулевое — даже у импорта администратора. Пускать
// неподтверждённые записи в линкинг нельзя: §E.5 требует брать в калибровку
// только валидные данные, а подогнать шкалу под чужие опечатки — худший из
// возможных способов ошибиться.

import { GradeLevel, gradeLevelFromScore } from "./mock-grade-level";
import { MOCK_SCALE_MAX } from "./rasch";

/** Кто внёс запись. */
export type CertificateSource =
    /** Импортировал администратор. */
    | "admin"
    /** Ученик ввёл сам. */
    | "self";

/** Статус доверия. Проверено — значит кто-то сверил с документом. */
export type CertificateVerification = "verified" | "unverified";

/**
 * Минимальный балл, с которым сертификат вообще выдаётся.
 *
 * §0.3: «< 46 — нет сертификата». То есть запись с баллом ниже 46 описывает
 * документ, которого не существует, и почти наверняка это опечатка.
 */
export const CERTIFICATE_MIN_SCORE = 46;

/** Уровни, которые может нести сертификат. `below_c` среди них нет — см. выше. */
export const CERTIFICATE_LEVELS: readonly GradeLevel[] = ["C", "C+", "B", "B+", "A", "A+"];

export type ExternalCertificateInput = {
    subjectId: string;
    /** Балл по шкале БМБА, 0–75. */
    score: number;
    /** Уровень с документа. Необязателен: на некоторых сертификатах только балл. */
    level?: GradeLevel | null;
    /** Дата выдачи, ISO. */
    issuedAt: string;
    certificateNumber?: string | null;
};

export type CertificateValidation =
    | { ok: true; levelFromScore: GradeLevel; levelMatches: boolean }
    | { ok: false; reason: string };

/**
 * Проверка заявленных данных.
 *
 * Уровень по баллу считается ТОЙ ЖЕ функцией, что и у наших моков
 * (`gradeLevelFromScore`): пороги 46/50/55/60/65/70 заданы государством и
 * одни для обеих шкал (§L.3, §R.4). Своя копия порогов здесь однажды разошлась
 * бы с основной.
 *
 * Несовпадение уровня с баллом НЕ отвергается: на документе напечатано и то и
 * другое, и если они расходятся, это находка про документ или про ввод, а не
 * повод запретить запись. Возвращаем флаг, решает человек.
 */
export function validateCertificate(input: ExternalCertificateInput): CertificateValidation {
    if (!input.subjectId) return { ok: false, reason: "Не указан предмет" };
    if (!Number.isFinite(input.score)) return { ok: false, reason: "Балл не число" };
    if (input.score < 0 || input.score > MOCK_SCALE_MAX) {
        return { ok: false, reason: `Балл ${input.score} вне шкалы 0–${MOCK_SCALE_MAX}` };
    }
    if (input.score < CERTIFICATE_MIN_SCORE) {
        return {
            ok: false,
            reason: `Балл ${input.score} ниже ${CERTIFICATE_MIN_SCORE}: с таким баллом сертификат не выдаётся (§0.3)`,
        };
    }
    if (input.level && !CERTIFICATE_LEVELS.includes(input.level)) {
        return { ok: false, reason: `Уровень ${input.level} не встречается на сертификате` };
    }
    const parsed = Date.parse(input.issuedAt);
    if (!Number.isFinite(parsed)) return { ok: false, reason: "Некорректная дата выдачи" };

    const levelFromScore = gradeLevelFromScore(input.score);
    return {
        ok: true,
        levelFromScore,
        levelMatches: !input.level || input.level === levelFromScore,
    };
}

/**
 * Годится ли запись для линкинга (§R.2, §E.5).
 *
 * Только подтверждённая: неподтверждённая — это чьё-то утверждение, а шкала,
 * подогнанная под чужие опечатки, ошибочна тем сильнее, чем увереннее выглядит.
 * Самозаявленная и подтверждённая — годится: подтверждает не источник, а
 * проверка.
 */
export function isUsableForLinking(record: {
    verification: CertificateVerification;
    levelMatches: boolean;
}): boolean {
    return record.verification === "verified" && record.levelMatches;
}
