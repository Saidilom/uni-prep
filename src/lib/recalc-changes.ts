// Что изменил пересчёт: сводка по парам «было → стало» для панели протокола.
//
// Чистая логика, без сети. Пары собирает вызывающий — из ревизий последнего
// прогона (mock_result_revisions) или из снимка отчёта до и после нажатия
// кнопки. Смена балла определяется так же, как при записи ревизии
// (scoreMovedForRevision): меньше видимой на экране точности — не смена.

import { scoreMovedForRevision } from "./certificate-scale";

export type ScorePair = {
    resultId: string;
    name: string;
    scoreBefore: number | null;
    scoreAfter: number | null;
    levelBefore: string | null;
    levelAfter: string | null;
};

export type ChangeSummary = {
    total: number;
    scoresChanged: number;
    levelsChanged: number;
    /** Средний модуль сдвига по изменившимся баллам; null, если сдвигов нет. */
    meanAbsShift: number | null;
    /** Сдвиг с наибольшим модулем, со знаком; null, если сдвигов нет. */
    maxShift: number | null;
    /** Только изменившиеся строки, по убыванию модуля сдвига. */
    changed: Array<ScorePair & { shift: number | null; levelMoved: boolean }>;
};

export function summarizeChanges(pairs: readonly ScorePair[]): ChangeSummary {
    const changed = pairs
        .map((pair) => {
            const scoreMoved = scoreMovedForRevision(pair.scoreBefore, pair.scoreAfter);
            const levelMoved = (pair.levelBefore ?? null) !== (pair.levelAfter ?? null);
            const shift = pair.scoreBefore !== null && pair.scoreAfter !== null
                ? pair.scoreAfter - pair.scoreBefore
                : null;
            return { ...pair, shift, levelMoved, moved: scoreMoved || levelMoved, scoreMoved };
        })
        .filter((row) => row.moved);

    const shifts = changed
        .filter((row) => row.scoreMoved && row.shift !== null)
        .map((row) => row.shift as number);
    const maxShift = shifts.length > 0
        ? shifts.reduce((best, s) => (Math.abs(s) > Math.abs(best) ? s : best))
        : null;

    return {
        total: pairs.length,
        scoresChanged: changed.filter((row) => row.scoreMoved).length,
        levelsChanged: changed.filter((row) => row.levelMoved).length,
        meanAbsShift: shifts.length > 0 ? shifts.reduce((sum, s) => sum + Math.abs(s), 0) / shifts.length : null,
        maxShift,
        changed: changed
            .map((row) => ({
                resultId: row.resultId, name: row.name,
                scoreBefore: row.scoreBefore, scoreAfter: row.scoreAfter,
                levelBefore: row.levelBefore, levelAfter: row.levelAfter,
                shift: row.shift, levelMoved: row.levelMoved,
            }))
            .sort((a, b) => Math.abs(b.shift ?? 0) - Math.abs(a.shift ?? 0)),
    };
}
