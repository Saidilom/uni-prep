// Разведение показанных баллов: разные наборы ответов — разный балл.
//
// Решение владельца от 2026-09-26: модель различает учеников (у каждого
// набора ответов свой θ и свой точный балл), но округление показа склеивает
// соседей, которые ближе шага сетки друг к другу. Здесь каждый различный
// набор ответов получает свою ячейку сетки показа, порядок по точному баллу
// сохраняется, а суммарное отклонение от точных баллов минимально.
//
// Задача: целые d_1 < d_2 < … < d_n (в шагах сетки), минимизирующие
// Σ |d_i − x_i|, где x_i — точный балл в шагах. Замена d_i = c_i + i сводит
// строгий рост к неубывающим c_i — это изотоническая регрессия по L1 на
// x_i − i, решаемая PAVA с медианой в блоке.
//
// Одинаковые наборы ответов делят одну ячейку: у них ровно одно измерение.

import { SCORE_DECIMALS } from "./certificate-scale";

const GRID = 10 ** SCORE_DECIMALS;

export type SeparationEntry = {
    exact: number;
    patternKey: string;
};

/** Целое c, минимизирующее Σ |c − v| по значениям блока. */
function bestInteger(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor((sorted.length - 1) / 2)];
    const cost = (c: number) => sorted.reduce((sum, v) => sum + Math.abs(c - v), 0);
    const low = Math.floor(median);
    return cost(low) <= cost(low + 1) ? low : low + 1;
}

export function separateDisplayedScores(entries: readonly SeparationEntry[], max: number): number[] {
    // Один точный балл на набор ответов — первый встреченный.
    const byKey = new Map<string, number>();
    for (const entry of entries) {
        if (!byKey.has(entry.patternKey)) byKey.set(entry.patternKey, entry.exact);
    }
    const patterns = Array.from(byKey.entries())
        .map(([key, exact]) => ({ key, exact }))
        .sort((a, b) => a.exact - b.exact || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    const blocks: Array<{ values: number[]; c: number }> = [];
    patterns.forEach((p, i) => {
        let block = { values: [p.exact * GRID - i], c: 0 };
        block.c = bestInteger(block.values);
        while (blocks.length > 0 && blocks[blocks.length - 1].c > block.c) {
            const prev = blocks.pop()!;
            const values = prev.values.concat(block.values);
            block = { values, c: bestInteger(values) };
        }
        blocks.push(block);
    });

    const cells: number[] = [];
    for (const block of blocks) {
        for (let k = 0; k < block.values.length; k++) cells.push(block.c + cells.length);
    }

    // Шкала ограничена [0, max]: у краёв ячейки сдвигаются внутрь, порядок
    // сохраняется.
    const top = Math.floor(max * GRID + 1e-9);
    for (let i = cells.length - 1; i >= 0; i--) {
        const limit = i === cells.length - 1 ? top : cells[i + 1] - 1;
        if (cells[i] > limit) cells[i] = limit;
    }
    for (let i = 0; i < cells.length; i++) {
        const limit = i === 0 ? 0 : cells[i - 1] + 1;
        if (cells[i] < limit) cells[i] = limit;
    }

    const displayed = new Map<string, number>();
    patterns.forEach((p, i) => displayed.set(p.key, cells[i] / GRID));
    return entries.map((entry) => displayed.get(entry.patternKey) as number);
}
