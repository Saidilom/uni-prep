import { describe, it, expect } from "vitest";
import { summarizeChanges, type ScorePair } from "./recalc-changes";

const pair = (id: string, before: number | null, after: number | null, lb: string | null, la: string | null): ScorePair => ({
    resultId: id, name: id, scoreBefore: before, scoreAfter: after, levelBefore: lb, levelAfter: la,
});

describe("summarizeChanges", () => {
    it("считает сдвиги, смены букв и сортирует по модулю сдвига", () => {
        const summary = summarizeChanges([
            pair("a", 50, 53, "C", "C"),
            pair("b", 60, 52, "B", "C"),
            pair("c", 40, 40, null, null),
        ]);
        expect(summary.total).toBe(3);
        expect(summary.scoresChanged).toBe(2);
        expect(summary.levelsChanged).toBe(1);
        expect(summary.meanAbsShift).toBeCloseTo(5.5);
        expect(summary.maxShift).toBe(-8);
        expect(summary.changed.map((r) => r.resultId)).toEqual(["b", "a"]);
    });

    it("сдвиг меньше видимой точности — не смена", () => {
        const summary = summarizeChanges([pair("a", 50.0001, 50.0002, "C", "C")]);
        expect(summary.scoresChanged).toBe(0);
        expect(summary.changed).toEqual([]);
        expect(summary.meanAbsShift).toBeNull();
        expect(summary.maxShift).toBeNull();
    });

    it("смена только буквы попадает в список без числового сдвига", () => {
        const summary = summarizeChanges([pair("a", null, null, "C", null)]);
        expect(summary.levelsChanged).toBe(1);
        expect(summary.scoresChanged).toBe(0);
        expect(summary.changed[0].shift).toBeNull();
    });
});
