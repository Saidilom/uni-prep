import { describe, it, expect } from "vitest";
import { estimateRasch, probability as raschProbability, type Observation } from "./rasch";
import { calibrate3pl, type CalibrationItemInput } from "./irt-3pl-calibration";
import { probability3pl, itemInformation3pl } from "./irt-3pl";
import {
    tierForN, selectModel, selectModelForTest, modelTransition, difficultyWeights, calibrateModel, RASCH_EQUIVALENT_A,
    MIN_N_FOR_2PL, MIN_N_FOR_3PL, type ModelType,
} from "./irt-model-selection";

function mulberry32(seed: number) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.min(2147483647, seed) ^ (seed >>> 15);
        t = (Math.imul(t, 1 | seed) + Math.imul(t ^ (t >>> 7), 61 | seed)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe("tierForN — пороги", () => {
    it("299 сдавших — ещё 1PL (OPLM)", () => expect(tierForN(299)).toBe("OPLM_1PL"));
    it("300 сдавших — уже 2PL", () => expect(tierForN(300)).toBe("IRT_2PL"));
    it("999 сдавших — ещё 2PL", () => expect(tierForN(999)).toBe("IRT_2PL"));
    it("1000 сдавших — уже 3PL", () => expect(tierForN(1000)).toBe("IRT_3PL"));
    it("пороги совпадают с экспортированными константами", () => {
        expect(tierForN(MIN_N_FOR_2PL)).toBe("IRT_2PL");
        expect(tierForN(MIN_N_FOR_3PL)).toBe("IRT_3PL");
    });
});

describe("selectModel — храповик", () => {
    it("не понижает модель, если N упал ниже порога", () => {
        expect(selectModel(250, "IRT_2PL")).toBe("IRT_2PL");
        expect(selectModel(50, "IRT_3PL")).toBe("IRT_3PL");
    });
    it("повышает модель сразу при пересечении порога, в том числе через ступень", () => {
        expect(selectModel(1500, "RASCH_1PL")).toBe("IRT_3PL");
        expect(selectModel(500, "RASCH_1PL")).toBe("IRT_2PL");
    });
    it("без истории (новый тест) выбирает по N без ограничений", () => {
        expect(selectModel(50, null)).toBe("OPLM_1PL");
        expect(selectModel(5000, null)).toBe("IRT_3PL");
    });
    it("RASCH_1PL — та же ступень: храповик не держит, переходит в OPLM", () => {
        expect(selectModel(36, "RASCH_1PL")).toBe("OPLM_1PL");
    });
});

describe("selectModelForTest — бэкфилл миграции 124 не запускает храповик", () => {
    it("3PL из бэкфилла (sampleSize = null) при N=54 уходит в 1PL, и это смена модели", () => {
        expect(selectModelForTest(54, { modelType: "IRT_3PL", sampleSize: null })).toEqual({
            modelType: "OPLM_1PL", previousModelType: "IRT_3PL", modelChanged: true,
        });
    });
    it("модель, выбранная диспетчером, при падении N не понижается", () => {
        expect(selectModelForTest(250, { modelType: "IRT_2PL", sampleSize: 310 })).toEqual({
            modelType: "IRT_2PL", previousModelType: "IRT_2PL", modelChanged: false,
        });
    });
    it("повышение на пороге 300 работает как раньше", () => {
        expect(selectModelForTest(300, { modelType: "RASCH_1PL", sampleSize: 299 })).toEqual({
            modelType: "IRT_2PL", previousModelType: "RASCH_1PL", modelChanged: true,
        });
    });
    it("новый тест без модели — выбор по N, не смена", () => {
        expect(selectModelForTest(36, { modelType: null, sampleSize: null })).toEqual({
            modelType: "OPLM_1PL", previousModelType: null, modelChanged: false,
        });
    });
    it("тест, уже посчитанный Рашем по N, переходит на OPLM — это смена модели", () => {
        expect(selectModelForTest(36, { modelType: "RASCH_1PL", sampleSize: 36 })).toEqual({
            modelType: "OPLM_1PL", previousModelType: "RASCH_1PL", modelChanged: true,
        });
    });
});

describe("difficultyWeights — линейно по сложности от 1 до 3", () => {
    it("самое лёгкое 1, самое трудное 3, между ними пропорционально b", () => {
        const b = [-2, -1, 0, 1, 2];
        const status = b.map(() => "OK" as const);
        expect(difficultyWeights(b, status)).toEqual([1, 1.5, 2, 2.5, 3]);
    });
    it("порядок заданий не важен — вес по значению b", () => {
        const b = [2, -2, 0.5];
        const status = b.map(() => "OK" as const);
        expect(difficultyWeights(b, status)).toEqual([3, 1, 2.25]);
    });
    it("крайние задания: никто не решил — 3, решили все или нет ответов — 1; в размах не входят", () => {
        const b = [-1, 0, 1, 8, -8, 0];
        const status = ["OK", "OK", "OK", "NONE_CORRECT", "ALL_CORRECT", "NO_RESPONSES"] as const;
        expect(difficultyWeights(b, [...status])).toEqual([1, 2, 3, 3, 1, 1]);
    });
    it("все b равны — вес 1 у всех", () => {
        expect(difficultyWeights([0.3, 0.3], ["OK", "OK"])).toEqual([1, 1]);
    });
});

describe("modelTransition — причина ревизии", () => {
    it("выше по ступени — UPGRADE", () => expect(modelTransition("RASCH_1PL", "IRT_2PL")).toBe("UPGRADE"));
    it("вниз с бэкфилла 3PL — SELECTED", () => expect(modelTransition("IRT_3PL", "OPLM_1PL")).toBe("SELECTED"));
    it("Раш → OPLM (та же ступень) — METHOD", () => expect(modelTransition("RASCH_1PL", "OPLM_1PL")).toBe("METHOD"));
    it("та же модель или нет истории — null", () => {
        expect(modelTransition("IRT_3PL", "IRT_3PL")).toBeNull();
        expect(modelTransition(null, "RASCH_1PL")).toBeNull();
    });
});

// ═══ Главная проверка: 1PL через estimateTheta3pl — точно классический Rasch ═══
//
// Это алгебраический факт (см. шапку irt-model-selection.ts), а не совпадение
// на конкретных данных — проверяем его на случайной сетке (θ,b), а не только
// в комментарии.
describe("RASCH_EQUIVALENT_A — вырождение 3PL в классический Rasch", () => {
    const rand = mulberry32(7);

    it("probability3pl(θ,{a:1/D,b,c:0}) совпадает с probability(θ,b) из rasch.ts", () => {
        for (let i = 0; i < 200; i++) {
            const theta = (rand() - 0.5) * 10;
            const b = (rand() - 0.5) * 10;
            const via3pl = probability3pl(theta, { a: RASCH_EQUIVALENT_A, b, c: 0 });
            const viaRasch = raschProbability(theta, b);
            expect(via3pl).toBeCloseTo(viaRasch, 9);
        }
    });

    it("itemInformation3pl(θ,{a:1/D,b,c:0}) совпадает с P(1−P)", () => {
        for (let i = 0; i < 200; i++) {
            const theta = (rand() - 0.5) * 10;
            const b = (rand() - 0.5) * 10;
            const info = itemInformation3pl(theta, { a: RASCH_EQUIVALENT_A, b, c: 0 });
            const p = raschProbability(theta, b);
            expect(info).toBeCloseTo(p * (1 - p), 9);
        }
    });
});

function buildItemsInput(personCount: number, itemCount: number, seed: number, missingRate = 0.05): CalibrationItemInput[] {
    const rand = mulberry32(seed);
    const trueTheta = Array.from({ length: personCount }, (_, n) => (n - (personCount - 1) / 2) * 0.3);
    const trueB = Array.from({ length: itemCount }, (_, i) => (i - (itemCount - 1) / 2) * 0.4);
    return Array.from({ length: itemCount }, (_, i) => ({
        optionCount: 4,
        responses: Array.from({ length: personCount }, (_, n) => {
            if (rand() < missingRate) return null;
            const p = 1 / (1 + Math.exp(-(trueTheta[n] - trueB[i])));
            return (rand() < p ? 1 : 0) as 0 | 1;
        }),
    }));
}

describe("calibrateModel — монтаж 1PL корректно вызывает estimateRasch", () => {
    it("те же b, что и прямой вызов estimateRasch на той же матрице; a зафиксирована в 1/D", () => {
        const itemsInput = buildItemsInput(30, 10, 42);
        const model = calibrateModel("RASCH_1PL", itemsInput);

        const observations: Observation[] = [];
        itemsInput.forEach((item, i) => item.responses.forEach((r, p) => {
            if (r !== null) observations.push({ person: p, item: i, correct: r });
        }));
        const direct = estimateRasch(observations, 30, 10);

        expect(model.items.map((it) => it.b)).toEqual(direct.itemDifficulty);
        expect(model.items.every((it) => it.a === RASCH_EQUIVALENT_A)).toBe(true);
        expect(model.items.every((it) => it.c === 0)).toBe(true);
        expect(model.converged).toBe(direct.converged);
    });

    it("model.probability/model.itemInformation согласованы с items", () => {
        const itemsInput = buildItemsInput(30, 10, 43);
        const model = calibrateModel("RASCH_1PL", itemsInput);
        const theta = 0.37;
        for (let i = 0; i < 10; i++) {
            expect(model.probability(theta, i)).toBeCloseTo(probability3pl(theta, model.items[i]), 12);
            expect(model.itemInformation(theta, i)).toBeCloseTo(itemInformation3pl(theta, model.items[i]), 12);
        }
    });
});

describe("calibrateModel — монтаж 2PL корректно вызывает calibrate3pl с fixedC", () => {
    it("те же a,b,c, что и прямой вызов calibrate3pl с optionCount:null на всех заданиях", () => {
        const itemsInput = buildItemsInput(60, 8, 99);
        const model = calibrateModel("IRT_2PL", itemsInput);

        const direct = calibrate3pl(itemsInput.map((it) => ({ responses: it.responses, optionCount: null })));

        expect(model.items.map((it) => it.a)).toEqual(direct.items.map((it) => it.a));
        expect(model.items.map((it) => it.b)).toEqual(direct.items.map((it) => it.b));
        expect(model.items.every((it) => it.c === 0)).toBe(true);
    });

    it("НЕ передаёт optionCount дальше как есть — угадывание везде зафиксировано в 0, даже если задание было с 4 вариантами", () => {
        const itemsInput = buildItemsInput(60, 8, 123);
        const model = calibrateModel("IRT_2PL", itemsInput);
        expect(model.items.every((it) => it.status === "FIXED_GUESSING" || it.status === "NO_RESPONSES" || it.status === "NONE_CORRECT" || it.status === "ALL_CORRECT")).toBe(true);
    });
});

describe("calibrateModel — 3PL остаётся полностью свободным (регрессия)", () => {
    it("совпадает с прямым calibrate3pl без принуждения к fixedC", () => {
        const itemsInput = buildItemsInput(60, 8, 7);
        const model = calibrateModel("IRT_3PL", itemsInput);
        const direct = calibrate3pl(itemsInput);
        expect(model.items.map((it) => it.a)).toEqual(direct.items.map((it) => it.a));
        expect(model.items.map((it) => it.b)).toEqual(direct.items.map((it) => it.b));
        expect(model.items.map((it) => it.c)).toEqual(direct.items.map((it) => it.c));
    });
});

describe("calibrateModel — estimateTheta реально использует калибровку этой же модели", () => {
    it.each<ModelType>(["RASCH_1PL", "IRT_2PL", "IRT_3PL"])("%s: сильный ученик получает θ выше слабого", (modelType) => {
        const itemCount = 10;
        const itemsInput: CalibrationItemInput[] = Array.from({ length: itemCount }, () => ({
            optionCount: 4,
            responses: Array.from({ length: 60 }, (_, n) => (n % 2 === 0 ? 1 : 0) as 0 | 1),
        }));
        const model = calibrateModel(modelType, itemsInput);
        const strong = model.estimateTheta(new Array(itemCount).fill(1) as Array<0 | 1>);
        const weak = model.estimateTheta(new Array(itemCount).fill(0) as Array<0 | 1>);
        expect(strong.theta).toBeGreaterThan(weak.theta);
    });
});

describe("calibrateModel — OPLM_1PL: веса по сложности входят в θ", () => {
    const rand = mulberry32(11);
    const itemCount = 12;
    const people = 80;
    const trueB = Array.from({ length: itemCount }, (_, i) => (i - (itemCount - 1) / 2) * 0.4);
    const items: CalibrationItemInput[] = trueB.map((b) => ({
        responses: Array.from({ length: people }, (_, p) => {
            const theta = (p - (people - 1) / 2) * 0.05;
            return (rand() < 1 / (1 + Math.exp(-(theta - b))) ? 1 : 0) as 0 | 1;
        }),
        optionCount: 4,
    }));
    const oplm = calibrateModel("OPLM_1PL", items);
    const rasch = calibrateModel("RASCH_1PL", items);

    it("у каждого задания вес в [1, 3], a = w/D, c = 0; у Раша веса нет", () => {
        for (const item of oplm.items) {
            expect(item.weight).toBeGreaterThanOrEqual(1);
            expect(item.weight).toBeLessThanOrEqual(3);
            expect(item.a).toBeCloseTo((item.weight as number) / 1.702, 12);
            expect(item.c).toBe(0);
        }
        expect(rasch.items.every((item) => item.weight === null)).toBe(true);
        expect(Math.max(...oplm.items.map((i) => i.weight as number))).toBe(3);
        expect(Math.min(...oplm.items.map((i) => i.weight as number))).toBe(1);
    });

    it("неравномерные сложности: разные наборы с одинаковым числом верных дают разные θ", () => {
        const r = mulberry32(5);
        const irregularB = Array.from({ length: itemCount }, () => (r() - 0.5) * 4);
        const model = calibrateModel("OPLM_1PL", irregularB.map((b) => ({
            responses: Array.from({ length: people }, (_, p) => {
                const theta = (p - (people - 1) / 2) * 0.05;
                return (r() < 1 / (1 + Math.exp(-(theta - b))) ? 1 : 0) as 0 | 1;
            }),
            optionCount: 4,
        })));
        let rows = 0;
        const thetas = new Set<string>();
        for (let mask = 0; mask < 1 << itemCount && rows < 60; mask++) {
            let count = 0;
            for (let k = 0; k < itemCount; k++) if (mask & (1 << k)) count++;
            if (count !== 6) continue;
            rows++;
            thetas.add(model.estimateTheta(Array.from({ length: itemCount }, (_, k) => ((mask >> k) & 1) as 0 | 1)).theta.toFixed(6));
        }
        expect(thetas.size).toBe(rows);
    });

    it("одинаковое число верных: у Раша одна θ, у OPLM выше тот, кто решил трудные", () => {
        const order = oplm.items.map((item, i) => ({ b: item.b, i })).sort((x, y) => x.b - y.b).map((x) => x.i);
        const easy = new Array(itemCount).fill(0) as Array<0 | 1>;
        const hard = new Array(itemCount).fill(0) as Array<0 | 1>;
        order.slice(0, 4).forEach((i) => { easy[i] = 1; });
        order.slice(-4).forEach((i) => { hard[i] = 1; });

        expect(rasch.estimateTheta(easy).theta).toBeCloseTo(rasch.estimateTheta(hard).theta, 6);
        expect(oplm.estimateTheta(hard).theta).toBeGreaterThan(oplm.estimateTheta(easy).theta + 0.2);
    });
});
