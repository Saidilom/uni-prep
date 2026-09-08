import { describe, it, expect } from "vitest";
import {
    categoryProbabilities,
    expectedScore,
    scoreVariance,
    polytomousInformation,
    standardizedResidual,
    polytomousFit,
    disorderedThresholds,
    estimateThresholds,
} from "./rasch-pcm";
import { testInformation } from "./rasch";

function mulberry32(seed: number) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.min(2147483647, seed) ^ (seed >>> 15);
        t = (Math.imul(t, 1 | seed) + Math.imul(t ^ (t >>> 7), 61 | seed)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe("categoryProbabilities (§J.2)", () => {
    it("вероятности категорий складываются в единицу", () => {
        for (const theta of [-4, -1, 0, 0.7, 3]) {
            for (const thresholds of [[0], [-1, 1], [-2, -0.5, 0.5, 2]]) {
                const p = categoryProbabilities(theta, thresholds);
                expect(p).toHaveLength(thresholds.length + 1);
                expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
                for (const v of p) expect(v).toBeGreaterThan(0);
            }
        }
    });

    it("выполняется само определение модели: ln(P_k / P_{k−1}) = θ − τ_k", () => {
        // Это и есть §J.2. Если равенство перестанет держаться, реализация
        // считает не PCM, как бы она ни называлась.
        const thresholds = [-1.2, 0.3, 1.4];
        for (const theta of [-2, -0.4, 0, 1.1, 2.5]) {
            const p = categoryProbabilities(theta, thresholds);
            for (let k = 1; k <= thresholds.length; k++) {
                expect(Math.log(p[k] / p[k - 1])).toBeCloseTo(theta - thresholds[k - 1], 10);
            }
        }
    });

    it("на пороге две смежные категории равновероятны", () => {
        const thresholds = [-1, 0.5];
        const p = categoryProbabilities(0.5, thresholds);
        expect(p[2]).toBeCloseTo(p[1], 10);
    });

    it("не переполняется на больших θ и многих категориях (§O.1)", () => {
        // Прямой exp(Σ(θ−τ)) здесь ушёл бы в Infinity, и все вероятности
        // стали бы NaN.
        const thresholds = new Array(20).fill(-8);
        const p = categoryProbabilities(8, thresholds);
        expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
        for (const v of p) expect(Number.isFinite(v)).toBe(true);
    });
});

describe("expectedScore и scoreVariance (§J.4)", () => {
    it("ожидаемый балл растёт по способности и лежит внутри 0..m", () => {
        const thresholds = [-1.5, 0, 1.5];
        let prev = -Infinity;
        for (const theta of [-5, -2, -1, 0, 1, 2, 5]) {
            const e = expectedScore(theta, thresholds);
            expect(e).toBeGreaterThan(prev);
            expect(e).toBeGreaterThan(0);
            expect(e).toBeLessThan(3);
            prev = e;
        }
    });

    it("дисперсия максимальна в середине шкалы и падает к краям", () => {
        const thresholds = [-1, 0, 1];
        const middle = scoreVariance(0, thresholds);
        expect(middle).toBeGreaterThan(scoreVariance(-6, thresholds));
        expect(middle).toBeGreaterThan(scoreVariance(6, thresholds));
    });

    it("информация политомного задания есть та же дисперсия (§J.9)", () => {
        const thresholds = [-1, 0.5];
        for (const theta of [-2, 0, 1.5]) {
            expect(polytomousInformation(theta, thresholds)).toBe(scoreVariance(theta, thresholds));
        }
    });
});

// Главная проверка обратной совместимости: задание с двумя категориями — это
// обычное дихотомическое задание, и PCM обязан дать в точности те же числа.
describe("две категории вырождаются в дихотомический Раш", () => {
    it("вероятность категории 1 равна логистической P(θ,b)", () => {
        for (const b of [-2, -0.3, 0, 1.7]) {
            for (const theta of [-3, -0.5, 0, 0.9, 4]) {
                const p = categoryProbabilities(theta, [b]);
                const logistic = 1 / (1 + Math.exp(-(theta - b)));
                expect(p[1]).toBeCloseTo(logistic, 12);
                expect(p[0]).toBeCloseTo(1 - logistic, 12);
            }
        }
    });

    it("ожидаемый балл равен P, а дисперсия — P(1−P)", () => {
        for (const b of [-1, 0, 2]) {
            for (const theta of [-2, 0, 1]) {
                const logistic = 1 / (1 + Math.exp(-(theta - b)));
                expect(expectedScore(theta, [b])).toBeCloseTo(logistic, 12);
                expect(scoreVariance(theta, [b])).toBeCloseTo(logistic * (1 - logistic), 12);
            }
        }
    });

    it("информация совпадает с дихотомической testInformation (§D.1)", () => {
        const bs = [-1.5, 0, 0.8];
        for (const theta of [-2, 0, 1.3]) {
            const viaPcm = bs.reduce((acc, b) => acc + polytomousInformation(theta, [b]), 0);
            expect(viaPcm).toBeCloseTo(testInformation(theta, bs), 12);
        }
    });
});

describe("остатки и fit (§J.9 = §182–184)", () => {
    it("стандартизованный остаток есть (X − E)/√V", () => {
        const thresholds = [-1, 1];
        const z = standardizedResidual(2, 0, thresholds)!;
        const expected = (2 - expectedScore(0, thresholds)) / Math.sqrt(scoreVariance(0, thresholds));
        expect(z).toBeCloseTo(expected, 12);
    });

    it("ответ ровно на ожидании даёт нулевой остаток", () => {
        const thresholds = [-1, 1];
        const e = expectedScore(0.25, thresholds);
        expect(standardizedResidual(e, 0.25, thresholds)!).toBeCloseTo(0, 12);
    });

    it("на данных, порождённых самой моделью, fit близок к единице", () => {
        // 1.0 означает «наблюдаемая вариация остатков равна ожидаемой» (§F.7).
        // Если бы формулы E и V были неверны, fit уехал бы от единицы.
        const thresholds = [-1.2, 0.1, 1.3];
        const rand = mulberry32(20260909);
        const responses: Array<{ observed: number; theta: number }> = [];
        for (let n = 0; n < 3000; n++) {
            const theta = -3 + (6 * n) / 2999;
            const p = categoryProbabilities(theta, thresholds);
            let u = rand();
            let observed = 0;
            for (let k = 0; k < p.length; k++) {
                u -= p[k];
                if (u <= 0) { observed = k; break; }
                observed = k;
            }
            responses.push({ observed, theta });
        }
        const fit = polytomousFit(responses, thresholds);
        expect(fit.observations).toBe(3000);
        expect(fit.outfit!).toBeGreaterThan(0.85);
        expect(fit.outfit!).toBeLessThan(1.15);
        expect(fit.infit!).toBeGreaterThan(0.85);
        expect(fit.infit!).toBeLessThan(1.15);
    });

    it("без пригодных наблюдений возвращает null, а не единицу", () => {
        expect(polytomousFit([], [-1, 1]).outfit).toBeNull();
    });
});

describe("разупорядоченные пороги (§J.6)", () => {
    it("находит порядок и его нарушение", () => {
        expect(disorderedThresholds([-1, 0, 1])).toEqual([]);
        expect(disorderedThresholds([-1, 1, 0])).toEqual([2]);
        expect(disorderedThresholds([1, 0, -1])).toEqual([1, 2]);
    });
});

// Оценка порогов ПО LIKELIHOOD, а не пропорцией (§J.8 = §180). Проверяем тем,
// что она восстанавливает заложенные пороги из порождённых ими же данных.
describe("estimateThresholds восстанавливает заложенные пороги (§180)", () => {
    const planted = [-1.4, 0.2, 1.1];

    function simulate(seed: number, persons = 4000) {
        const rand = mulberry32(seed);
        const responses: Array<{ observed: number; theta: number }> = [];
        for (let n = 0; n < persons; n++) {
            const theta = -3 + (6 * n) / (persons - 1);
            const p = categoryProbabilities(theta, planted);
            let u = rand();
            let observed = 0;
            for (let k = 0; k < p.length; k++) {
                u -= p[k];
                if (u <= 0) { observed = k; break; }
                observed = k;
            }
            responses.push({ observed, theta });
        }
        return responses;
    }

    it("сходится и попадает в заложенные значения", () => {
        const estimate = estimateThresholds(simulate(7), 4);
        expect(estimate.status).toBe("OK");
        expect(estimate.thresholds).toHaveLength(3);
        for (let k = 0; k < planted.length; k++) {
            expect(estimate.thresholds[k]).toBeCloseTo(planted[k], 1);
        }
    });

    it("уравнение оценки выполнено: наблюдённое = ожидаемое (§180)", () => {
        // Содержательная запись условия ∂logL/∂τ_k = 0. Проверяем не «похоже»,
        // а само уравнение — иначе тест ловил бы только совпадение чисел.
        const responses = simulate(11);
        const { thresholds, status } = estimateThresholds(responses, 4);
        expect(status).toBe("OK");
        for (let k = 1; k <= thresholds.length; k++) {
            let observedReaching = 0;
            let expectedReaching = 0;
            for (const r of responses) {
                if (r.observed >= k) observedReaching++;
                const p = categoryProbabilities(r.theta, thresholds);
                for (let h = k; h < p.length; h++) expectedReaching += p[h];
            }
            // Допуск в долю процента: остаток гасится до 1e-6 по шагу порога,
            // а не по самому счётчику.
            expect(Math.abs(observedReaching - expectedReaching) / responses.length).toBeLessThan(0.005);
        }
    });

    it("детерминизм: один вход — один результат (§O.4)", () => {
        const responses = simulate(3);
        expect(estimateThresholds(responses, 4).thresholds)
            .toEqual(estimateThresholds(responses, 4).thresholds);
    });
});

// ЭТО СОСТОЯНИЕ НАШИХ ДАННЫХ. На проде все 54 сочинения получили 0, то есть
// наблюдения есть ровно в одной категории из 25. Пороги в таком случае не
// оцениваются, и модуль обязан сказать это статусом, а не выдать числа.
describe("отказ вместо выдумки, когда категория пуста (§J.5, §219–220)", () => {
    it("все ответы в нулевой категории — EMPTY_CATEGORY и ПУСТЫЕ пороги", () => {
        const responses = Array.from({ length: 54 }, (_, n) => ({ observed: 0, theta: -1 + n * 0.02 }));
        const estimate = estimateThresholds(responses, 25);
        expect(estimate.status).toBe("EMPTY_CATEGORY");
        expect(estimate.thresholds).toEqual([]);
        // Видно, какие именно категории пусты — это и есть содержание отказа.
        expect(estimate.emptyCategories).toHaveLength(24);
        expect(estimate.categoryCounts[0]).toBe(54);
    });

    it("пустая категория В СЕРЕДИНЕ тоже блокирует оценку", () => {
        // Рубрика различает то, чего в ответах нет: порог такой категории
        // уходит в бесконечность, и §J.5 требует это заметить.
        const responses = [
            ...Array.from({ length: 30 }, (_, n) => ({ observed: 0, theta: -2 + n * 0.05 })),
            ...Array.from({ length: 30 }, (_, n) => ({ observed: 2, theta: 0 + n * 0.05 })),
        ];
        const estimate = estimateThresholds(responses, 3);
        expect(estimate.status).toBe("EMPTY_CATEGORY");
        expect(estimate.emptyCategories).toEqual([1]);
    });

    it("без ответов — NO_RESPONSES", () => {
        expect(estimateThresholds([], 5).status).toBe("NO_RESPONSES");
    });

    it("одна категория — это не политомное задание", () => {
        const responses = Array.from({ length: 10 }, () => ({ observed: 0, theta: 0 }));
        expect(estimateThresholds(responses, 1).status).toBe("EMPTY_CATEGORY");
    });
});
