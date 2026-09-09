// Места в группе: золото, серебро, бронза, дальше числом.
//
// ═══ ДВА СЛУЧАЯ, КОТОРЫЕ РЕШАЮТ ВСЁ ═══
//
// РАВНЫЕ БАЛЛЫ. Место общее, а следующее — пропускается: 60, 60, 55 дают
// первое, первое и ТРЕТЬЕ. Так устроены все соревнования, и так честно: если
// двое набрали одинаково, назначить одному из них второе место можно только
// произволом — по алфавиту или по порядку в базе, то есть по причине, которая
// к учёбе отношения не имеет.
//
// Отсюда следствие: серебра в группе может не быть вовсе. Два золота — и
// следующий сразу бронзовый. Это не сбой, а прямое следствие равенства.
//
// НЕ СДАВАЛ. Балла нет — места нет. Поставить такому ученику последнее место
// значило бы объявить его проигравшим, хотя он не участвовал; поставить ноль
// значило бы приписать ему результат, которого не было (§233). Такие ученики
// уходят в конец списка без медали и без номера.

export type PodiumMedal = "gold" | "silver" | "bronze";

export type PodiumEntry<T> = {
    item: T;
    /** Место, 1 и далее. null — ученик не сдавал, места нет. */
    place: number | null;
    /** Медаль первых трёх мест. null — место ниже третьего или его нет. */
    medal: PodiumMedal | null;
};

const MEDALS: Record<number, PodiumMedal> = { 1: "gold", 2: "silver", 3: "bronze" };

/**
 * Расставляет места по баллу, от большего к меньшему.
 *
 * Порядок внутри одинакового балла сохраняется таким, каким пришёл: у них одно
 * и то же место, и переставлять их местами не за что.
 */
export function buildPodium<T>(items: readonly T[], scoreOf: (item: T) => number | null): Array<PodiumEntry<T>> {
    const scored: Array<{ item: T; score: number }> = [];
    const unscored: T[] = [];
    for (const item of items) {
        const score = scoreOf(item);
        if (score === null || score === undefined || !Number.isFinite(score)) unscored.push(item);
        else scored.push({ item, score });
    }

    // Стабильная сортировка: при равном балле порядок остаётся входным.
    const ordered = scored
        .map((entry, index) => ({ ...entry, index }))
        .sort((a, b) => b.score - a.score || a.index - b.index);

    const result: Array<PodiumEntry<T>> = [];
    let place = 0;
    let previousScore: number | null = null;
    ordered.forEach((entry, position) => {
        // Место меняется только когда меняется балл. Считается от ПОЗИЦИИ, а не
        // прибавлением единицы: так после двух золотых следующий получает
        // третье, а не второе.
        if (previousScore === null || entry.score !== previousScore) {
            place = position + 1;
            previousScore = entry.score;
        }
        result.push({ item: entry.item, place, medal: MEDALS[place] ?? null });
    });

    unscored.forEach((item) => result.push({ item, place: null, medal: null }));
    return result;
}

/** Есть ли вообще кому вручать медали. */
export const podiumHasWinners = <T>(entries: ReadonlyArray<PodiumEntry<T>>): boolean =>
    entries.some((e) => e.medal !== null);
