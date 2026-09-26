import { describe, it, expect } from "vitest";
import { separateDisplayedScores } from "./score-separation";
import { roundScore } from "./certificate-scale";

function mulberry32(seed: number) {
    return () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const entries = (exact: number[]) => exact.map((value, i) => ({ exact: value, patternKey: `p${i}` }));

describe("separateDisplayedScores", () => {
    it("без совпадений — обычное округление", () => {
        const exact = [24.353, 30.1, 47.777];
        expect(separateDisplayedScores(entries(exact), 75)).toEqual(exact.map(roundScore));
    });

    it("разные наборы, совпавшие при округлении, получают разные ячейки ближе всего к точным", () => {
        // Оба округляются в 24.35; ближе к своему точному сдвигается нижний.
        expect(separateDisplayedScores(entries([24.3512, 24.3538]), 75)).toEqual([24.35, 24.36]);
        expect(separateDisplayedScores(entries([24.3462, 24.3488]), 75)).toEqual([24.34, 24.35]);
    });

    it("одинаковые наборы ответов делят одну ячейку", () => {
        const result = separateDisplayedScores([
            { exact: 20.55, patternKey: "zero" },
            { exact: 20.55, patternKey: "zero" },
            { exact: 20.551, patternKey: "other" },
        ], 75);
        expect(result[0]).toBe(result[1]);
        expect(result[2]).not.toBe(result[0]);
    });

    it("у верха шкалы сдвиг идёт вниз, не выше максимума", () => {
        expect(separateDisplayedScores(entries([75, 75, 75]), 75)).toEqual([74.98, 74.99, 75]);
    });

    it("у нуля сдвиг идёт вверх, не ниже нуля", () => {
        expect(separateDisplayedScores(entries([0, 0, 0]), 75)).toEqual([0, 0.01, 0.02]);
    });

    it("300 учеников в плотной середине: порядок сохранён, все разные, сдвиг мал", () => {
        const rand = mulberry32(3);
        const exact = Array.from({ length: 300 }, () => 50 + (rand() + rand() + rand() - 1.5) * 8);
        const shown = separateDisplayedScores(entries(exact), 75);
        expect(new Set(shown).size).toBe(300);
        const order = exact.map((_, i) => i).sort((a, b) => exact[a] - exact[b]);
        for (let k = 1; k < order.length; k++) expect(shown[order[k]]).toBeGreaterThan(shown[order[k - 1]]);
        const maxShift = Math.max(...shown.map((s, i) => Math.abs(s - exact[i])));
        expect(maxShift).toBeLessThan(0.1);
        for (const s of shown) expect(roundScore(s)).toBe(s);
    });
});
