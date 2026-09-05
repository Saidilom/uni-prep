import { describe, it, expect } from "vitest";
import { raschThetaToT, writingRawToScore, writingPointsToScore, cefrBandFromScore, mean, stdev } from "./english-cefr";

describe("raschThetaToT", () => {
    // Раньше здесь возвращалась голая середина шкалы (50), одинаковая при любой
    // theta. Теперь при отсутствии когорты отсчёт идёт от банка вопросов:
    // центр 0, разброс 1 логит, поэтому theta 1.2 даёт 1.2*10 + 50 = 62.
    it("standardizes against the item pool when stdev is ~0 — no cohort to compare with", () => {
        expect(raschThetaToT(1.2, 0.5, 0)).toBe(62);
        expect(raschThetaToT(1.2, 0.5, 1e-9)).toBe(62);
    });

    it("maps a theta at the mean to T=50", () => {
        expect(raschThetaToT(0.5, 0.5, 1)).toBe(50);
    });

    it("maps +1 stdev above the mean to T=60", () => {
        expect(raschThetaToT(1.5, 0.5, 1)).toBe(60);
    });

    it("caps at 75 for very high ability (no C2 tested)", () => {
        expect(raschThetaToT(10, 0.5, 1)).toBe(75);
    });

    it("floors at 0 for very low ability", () => {
        expect(raschThetaToT(-10, 0.5, 1)).toBe(0);
    });
});

describe("writingRawToScore", () => {
    it("maps 0 to 0", () => {
        expect(writingRawToScore(0)).toBe(0);
    });

    it("matches the printed table's 0.5-wide bins", () => {
        expect(writingRawToScore(0.5)).toBe(10);
        expect(writingRawToScore(0.3)).toBe(10);
        expect(writingRawToScore(1.0)).toBe(11);
        expect(writingRawToScore(26.5)).toBe(62);
        expect(writingRawToScore(27.0)).toBe(63);
    });

    it("matches the printed table's wider 1.0 bins around 27-30", () => {
        expect(writingRawToScore(27.5)).toBe(64);
        expect(writingRawToScore(28.0)).toBe(64);
        expect(writingRawToScore(28.5)).toBe(65);
        expect(writingRawToScore(29.0)).toBe(65);
        expect(writingRawToScore(29.5)).toBe(66);
        expect(writingRawToScore(30.0)).toBe(66);
    });

    it("matches the printed table's wider 1.0 bins near the top", () => {
        expect(writingRawToScore(33.5)).toBe(73);
        expect(writingRawToScore(34.5)).toBe(74);
        expect(writingRawToScore(35.5)).toBe(75);
        expect(writingRawToScore(36.0)).toBe(75);
    });

    it("clamps above 36", () => {
        expect(writingRawToScore(40)).toBe(75);
    });
});

describe("writingPointsToScore", () => {
    it("scales earned points by 1.2 before the table lookup (Task1 max 10 -> weight 12)", () => {
        // 10 earned points (a perfect Task1) -> 10*1.2=12 raw -> table says 12.0->33
        expect(writingPointsToScore(10)).toBe(33);
    });

    it("a perfect Task1 + perfect Task2 (30 raw points) -> 36 raw -> 75", () => {
        expect(writingPointsToScore(30)).toBe(75);
    });
});

describe("cefrBandFromScore", () => {
    it("bands match the official thresholds exactly at the boundaries", () => {
        expect(cefrBandFromScore(65)).toBe("C1");
        expect(cefrBandFromScore(64)).toBe("B2");
        expect(cefrBandFromScore(51)).toBe("B2");
        expect(cefrBandFromScore(50)).toBe("B1");
        expect(cefrBandFromScore(38)).toBe("B1");
        expect(cefrBandFromScore(37)).toBe("<B1");
        expect(cefrBandFromScore(0)).toBe("<B1");
    });
});

describe("mean/stdev", () => {
    it("mean of an empty array is 0", () => {
        expect(mean([])).toBe(0);
    });

    it("stdev of fewer than 2 values is 0 (population size too small to standardize)", () => {
        expect(stdev([])).toBe(0);
        expect(stdev([5])).toBe(0);
    });

    it("computes population stdev correctly", () => {
        expect(mean([1, 2, 3])).toBeCloseTo(2);
        expect(stdev([1, 2, 3])).toBeCloseTo(0.8165, 3);
    });
});
