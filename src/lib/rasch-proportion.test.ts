import { describe, it, expect } from "vitest";
import {
    proportionDifficulty, proportionDifficulties, cohortStatistics, EXTREME_ADJUSTMENT,
} from "./rasch-proportion";

describe("proportionDifficulty — таблица владельца", () => {
    // Числа из документа (два скриншота). Сверяем ВСЕ строки: таблица — это и
    // есть принятая норма, и расхождение с ней означало бы другую формулу.
    const TABLE: Array<[percent: number, beta: number]> = [
        [5, 2.94],
        [10, 2.20],
        [20, 1.39],
        [30, 0.85],
        [40, 0.41],
        [50, 0.00],
        [60, -0.41],
        [70, -0.85],
        [80, -1.39],
        [90, -2.20],
        [95, -2.94],
    ];

    it.each(TABLE)("решили %i%% → β = %f", (percent, beta) => {
        // 1000 отвечавших, чтобы доля попала ровно в нужный процент и ни один
        // случай не зацепил поправку на крайние.
        const result = proportionDifficulty({ correct: percent * 10, responses: 1000 });
        expect(result.status).toBe("OK");
        expect(result.difficulty).toBeCloseTo(beta, 2);
    });

    it("ровно половина — это нулевая сложность, точка отсчёта шкалы", () => {
        expect(proportionDifficulty({ correct: 18, responses: 36 }).difficulty).toBe(0);
    });

    it("чем меньше решивших, тем БОЛЬШЕ β", () => {
        const hard = proportionDifficulty({ correct: 2, responses: 100 }).difficulty;
        const easy = proportionDifficulty({ correct: 90, responses: 100 }).difficulty;
        expect(hard).toBeGreaterThan(0);
        expect(easy).toBeLessThan(0);
        expect(hard).toBeGreaterThan(easy);
    });
});

describe("крайние доли — то, на чём голая формула обрывает расчёт", () => {
    it("не решил никто — конечное число, а не Infinity", () => {
        // На боевом моке по математике таких заданий 5 из 55. Без поправки
        // ln(0) обрывал бы расчёт всего теста.
        const result = proportionDifficulty({ correct: 0, responses: 36 });
        expect(Number.isFinite(result.difficulty)).toBe(true);
        expect(result.status).toBe("NONE_CORRECT");
        expect(result.proportion).toBe(0);
        expect(result.adjustedProportion).toBeCloseTo(EXTREME_ADJUSTMENT / 36, 12);
    });

    it("решили все — тоже конечное, и с обратным знаком", () => {
        const result = proportionDifficulty({ correct: 36, responses: 36 });
        expect(Number.isFinite(result.difficulty)).toBe(true);
        expect(result.status).toBe("ALL_CORRECT");
        expect(result.difficulty).toBeLessThan(0);
    });

    it("крайние остаются самыми трудными и самыми лёгкими в варианте", () => {
        // Поправка не должна переставлять задания местами: «не решил никто»
        // обязано остаться труднее, чем «решил один из тридцати шести».
        const none = proportionDifficulty({ correct: 0, responses: 36 }).difficulty;
        const one = proportionDifficulty({ correct: 1, responses: 36 }).difficulty;
        const all = proportionDifficulty({ correct: 36, responses: 36 }).difficulty;
        const allButOne = proportionDifficulty({ correct: 35, responses: 36 }).difficulty;
        expect(none).toBeGreaterThan(one);
        expect(all).toBeLessThan(allButOne);
    });

    it("задание без ответов не получает выдуманной сложности", () => {
        const result = proportionDifficulty({ correct: 0, responses: 0 });
        expect(result.status).toBe("NO_RESPONSES");
        expect(Number.isNaN(result.difficulty)).toBe(true);
    });

    it("по всему варианту считается в том же порядке", () => {
        const list = proportionDifficulties([
            { correct: 30, responses: 36 },
            { correct: 0, responses: 36 },
            { correct: 18, responses: 36 },
        ]);
        expect(list).toHaveLength(3);
        expect(list[0].difficulty).toBeLessThan(0);
        expect(list[1].status).toBe("NONE_CORRECT");
        expect(list[2].difficulty).toBe(0);
    });
});

describe("cohortStatistics — шаги 5–6 документа", () => {
    it("среднее и выборочное отклонение потока", () => {
        const stats = cohortStatistics([-1, 0, 1]);
        expect(stats.status).toBe("OK");
        expect(stats.mu).toBeCloseTo(0, 12);
        expect(stats.sigma).toBeCloseTo(1, 12);
        expect(stats.count).toBe(3);
    });

    it("центрирование по потоку даёт средний T ровно 50 — это свойство, не совпадение", () => {
        const thetas = [-2.1, -0.4, 0.3, 1.2, 2.6];
        const { mu, sigma } = cohortStatistics(thetas);
        const ts = thetas.map((theta) => 50 + 10 * (theta - mu) / sigma);
        const meanT = ts.reduce((sum, t) => sum + t, 0) / ts.length;
        expect(meanT).toBeCloseTo(50, 10);
    });

    it("один сдавший — сравнивать не с кем, и это отдельный статус", () => {
        const stats = cohortStatistics([0.7]);
        expect(stats.status).toBe("TOO_FEW");
        expect(Number.isNaN(stats.sigma)).toBe(true);
        // На проде такой тест уже есть: «Tarix fanidan namunaviy test», 1 сдача.
    });

    it("пустой поток тоже TOO_FEW, а не ноль", () => {
        expect(cohortStatistics([]).status).toBe("TOO_FEW");
    });

    it("все решили одинаково — разброса нет, делить не на что", () => {
        const stats = cohortStatistics([1.5, 1.5, 1.5]);
        expect(stats.status).toBe("NO_SPREAD");
        expect(Number.isNaN(stats.sigma)).toBe(true);
        expect(stats.mu).toBeCloseTo(1.5, 12);
    });

    it("нечисловые θ в расчёт не попадают", () => {
        const stats = cohortStatistics([1, NaN, -1, Infinity]);
        expect(stats.count).toBe(2);
        expect(stats.mu).toBeCloseTo(0, 12);
    });
});
