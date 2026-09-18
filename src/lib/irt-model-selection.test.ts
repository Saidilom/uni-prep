import { describe, it, expect } from "vitest";
import { estimateRasch, probability as raschProbability, type Observation } from "./rasch";
import { calibrate3pl, type CalibrationItemInput } from "./irt-3pl-calibration";
import { probability3pl, itemInformation3pl } from "./irt-3pl";
import {
    tierForN, selectModel, calibrateModel, RASCH_EQUIVALENT_A,
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
    it("299 сдавших — ещё 1PL", () => expect(tierForN(299)).toBe("RASCH_1PL"));
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
        expect(selectModel(50, null)).toBe("RASCH_1PL");
        expect(selectModel(5000, null)).toBe("IRT_3PL");
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
