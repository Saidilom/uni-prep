import { describe, it, expect } from "vitest";
import { estimateRasch, Observation } from "./rasch";

// Deterministic PRNG so the "noisy sample" tests are reproducible.
function mulberry32(seed: number) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.min(2147483647, seed) ^ (seed >>> 15);
        t = (Math.imul(t, 1 | seed) + Math.imul(t ^ (t >>> 7), 61 | seed)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function probability(theta: number, b: number): number {
    return 1 / (1 + Math.exp(-(theta - b)));
}

function simulate(personCount: number, itemCount: number, trueTheta: number[], trueB: number[], missingRate: number, seed: number) {
    const rand = mulberry32(seed);
    const observations: Observation[] = [];
    for (let n = 0; n < personCount; n++) {
        for (let i = 0; i < itemCount; i++) {
            if (rand() < missingRate) continue;
            const p = probability(trueTheta[n], trueB[i]);
            observations.push({ person: n, item: i, correct: rand() < p ? 1 : 0 });
        }
    }
    return observations;
}

function correlation(a: number[], b: number[]): number {
    const n = a.length;
    const ma = a.reduce((x, y) => x + y, 0) / n;
    const mb = b.reduce((x, y) => x + y, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
        num += (a[i] - ma) * (b[i] - mb);
        da += (a[i] - ma) ** 2;
        db += (b[i] - mb) ** 2;
    }
    return num / Math.sqrt(da * db);
}

describe("estimateRasch", () => {
    it("recovers item difficulty and person ability from a noisy, incomplete sample", () => {
        const personCount = 30;
        const itemCount = 10;
        const trueTheta = Array.from({ length: personCount }, (_, i) => (i - (personCount - 1) / 2) * 0.3);
        const trueB = Array.from({ length: itemCount }, (_, i) => (i - (itemCount - 1) / 2) * 0.4);
        const observations = simulate(personCount, itemCount, trueTheta, trueB, 0.05, 42);

        const result = estimateRasch(observations, personCount, itemCount);

        expect(result.converged).toBe(true);
        // mean-centering identification constraint
        const meanB = result.itemDifficulty.reduce((a, b) => a + b, 0) / itemCount;
        expect(Math.abs(meanB)).toBeLessThan(1e-6);

        const meanTrueB = trueB.reduce((a, b) => a + b, 0) / itemCount;
        const centeredTrueB = trueB.map((b) => b - meanTrueB);
        expect(correlation(result.itemDifficulty, centeredTrueB)).toBeGreaterThan(0.85);
        expect(correlation(result.personAbility, trueTheta)).toBeGreaterThan(0.85);
    });

    it("keeps perfect scores finite instead of diverging to +/-Infinity", () => {
        const observations: Observation[] = [];
        for (let i = 0; i < 5; i++) {
            observations.push({ person: 0, item: i, correct: 1 }); // always correct
            observations.push({ person: 1, item: i, correct: 0 }); // always wrong
        }
        const result = estimateRasch(observations, 2, 5);

        expect(result.personAbility.every(Number.isFinite)).toBe(true);
        expect(result.itemDifficulty.every(Number.isFinite)).toBe(true);
        // the perfect scorer must end up strictly more able than the zero scorer
        expect(result.personAbility[0]).toBeGreaterThan(result.personAbility[1]);
        // and bounded within the documented clamp range
        expect(Math.abs(result.personAbility[0])).toBeLessThanOrEqual(8);
        expect(Math.abs(result.personAbility[1])).toBeLessThanOrEqual(8);
    });

    it("handles a person/item that has zero observations without throwing", () => {
        const observations: Observation[] = [
            { person: 0, item: 0, correct: 1 },
            { person: 0, item: 1, correct: 0 },
        ];
        // personCount=3, itemCount=3 but person 2 and item 2 never appear in observations
        const result = estimateRasch(observations, 3, 3);
        expect(result.personAbility).toHaveLength(3);
        expect(result.itemDifficulty).toHaveLength(3);
        expect(result.personAbility.every(Number.isFinite)).toBe(true);
    });

    it("ranks a stronger student above a weaker one on a small, simple sample", () => {
        // Person 0 gets everything right, person 1 gets everything wrong,
        // person 2 gets half right — should end up ordered 0 > 2 > 1.
        const observations: Observation[] = [];
        for (let i = 0; i < 6; i++) {
            observations.push({ person: 0, item: i, correct: 1 });
            observations.push({ person: 1, item: i, correct: 0 });
            observations.push({ person: 2, item: i, correct: i % 2 as 0 | 1 });
        }
        const result = estimateRasch(observations, 3, 6);
        expect(result.personAbility[0]).toBeGreaterThan(result.personAbility[2]);
        expect(result.personAbility[2]).toBeGreaterThan(result.personAbility[1]);
    });
});
