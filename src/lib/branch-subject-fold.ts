// Свёртка разбора филиала по предметам.
//
// Вынесено из страницы отдельным модулем по той же причине, что и
// payment-rules.ts: здесь арифметика с ловушкой, а не вёрстка.
//
// ═══ ЛОВУШКА ═══
//
// Складывать средние НЕЛЬЗЯ без весов. `get_branch_subject_breakdown` отдаёт
// строку на каждый сырой subject_id, и исторические 'russian' и 'uzbek' — тот
// же «родной язык», что 'native'. Если сложить их средние и поделить на три,
// предмет с двумя сдачами весит столько же, сколько предмет с сорока, и
// свёрнутый балл разойдётся с тем, что показано по филиалу целиком.
//
// Поэтому складываются суммы (среднее × число попыток) и числа попыток, а
// деление стоит одно, в самом конце.
//
// ═══ ГДЕ ЖИВЁТ СПИСОК ПРЕДМЕТОВ ═══
//
// В mock-import-schema.ts, и здесь он не дублируется: `coreSubjectMatches`
// сам знает, что 'russian' и 'uzbek' попадают в 'native'. Свой второй список
// однажды разошёлся бы с первым.

import { CORE_SUBJECTS, CoreSubject, coreSubjectMatches } from "./mock-import-schema";

/** Строка из get_branch_subject_breakdown. */
export type SubjectBreakdownRow = {
    subjectId: string;
    oylikAvg: number | null;
    oylikAttempts: number;
    overallAvg: number | null;
    overallAttempts: number;
};

export type SubjectBucket = {
    /** Ключ группировки: CoreSubject либо сырой subject_id, если не попал. */
    key: string;
    /** null — предмет вне CORE_SUBJECTS, показывается своим сырым id. */
    core: CoreSubject | null;
    /** Средний по месячному комплекту. null — сдач не было. */
    oylikAvg: number | null;
    oylikAttempts: number;
    overallAvg: number | null;
    overallAttempts: number;
};

const avgOf = (sum: number, count: number): number | null => (count > 0 ? sum / count : null);

/**
 * Складывает сырые строки в предметы и считает взвешенные средние.
 *
 * Порядок: сначала слабый по месячному баллу — ради него страницу и
 * открывают. Предметы без месячных сдач уходят вниз и сортируются по числу
 * сдач, чтобы порядок не прыгал от строки к строке.
 */
export function foldSubjectBreakdown(rows: readonly SubjectBreakdownRow[]): SubjectBucket[] {
    const sums = new Map<string, {
        core: CoreSubject | null;
        oylikSum: number; oylikAttempts: number;
        overallSum: number; overallAttempts: number;
    }>();

    for (const row of rows) {
        const core = CORE_SUBJECTS.find((c) => coreSubjectMatches(row.subjectId, c)) ?? null;
        const key = core ?? row.subjectId;
        const bucket = sums.get(key)
            ?? { core, oylikSum: 0, oylikAttempts: 0, overallSum: 0, overallAttempts: 0 };
        // Среднее без попыток — это отсутствие данных, а не ноль баллов:
        // прибавить его значило бы утянуть свёрнутый балл вниз.
        if (row.oylikAvg !== null && Number.isFinite(row.oylikAvg) && row.oylikAttempts > 0) {
            bucket.oylikSum += row.oylikAvg * row.oylikAttempts;
            bucket.oylikAttempts += row.oylikAttempts;
        }
        if (row.overallAvg !== null && Number.isFinite(row.overallAvg) && row.overallAttempts > 0) {
            bucket.overallSum += row.overallAvg * row.overallAttempts;
            bucket.overallAttempts += row.overallAttempts;
        }
        sums.set(key, bucket);
    }

    return Array.from(sums.entries())
        .map(([key, b]) => ({
            key,
            core: b.core,
            oylikAvg: avgOf(b.oylikSum, b.oylikAttempts),
            oylikAttempts: b.oylikAttempts,
            overallAvg: avgOf(b.overallSum, b.overallAttempts),
            overallAttempts: b.overallAttempts,
        }))
        .sort((a, z) => {
            if (a.oylikAvg === null && z.oylikAvg === null) return z.overallAttempts - a.overallAttempts;
            if (a.oylikAvg === null) return 1;
            if (z.oylikAvg === null) return -1;
            return a.oylikAvg - z.oylikAvg;
        });
}
