import { describe, it, expect } from "vitest";
import {
    probability3pl, probabilityDerivative3pl, itemInformation3pl, testInformation3pl,
    standardError3pl, estimateTheta3pl, SCALING_D, type Item3pl, type Response3pl,
} from "./irt-3pl";
import { calibrate3pl, type CalibrationItemInput } from "./irt-3pl-calibration";
import { probability as raschProbability } from "./rasch";

// Проверка 3PL — та же, что уже сделана для Раша в rasch-cohort.test.ts: мы
// сами задаём заданиям параметры, генерируем по ним ответы и смотрим, вернёт
// ли калибровка то, что было заложено.
//
// Тест детерминированный: свой ГПСЧ с зерном, без Math.random. Иначе он падал
// бы раз в сто прогонов, и его перестали бы читать.

function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe("probability3pl — основная формула", () => {
    it("нижняя асимптота равна c, верхняя — единице", () => {
        const item: Item3pl = { a: 1.2, b: 0.4, c: 0.25 };
        expect(probability3pl(-50, item)).toBeCloseTo(0.25, 10);
        expect(probability3pl(50, item)).toBeCloseTo(1, 10);
    });

    it("в точке b вероятность равна (1+c)/2", () => {
        // Прямо из разбора: b — это θ, при которой P = середине между
        // угадыванием и единицей.
        const item: Item3pl = { a: 0.8, b: -1.3, c: 0.2 };
        expect(probability3pl(item.b, item)).toBeCloseTo((1 + item.c) / 2, 12);
    });

    it("при a = 1 и c = 0 совпадает с моделью Раша с точностью до масштаба D", () => {
        // Общая точка с действующей моделью: та же логистика, только аргумент
        // умножен на 1.702.
        for (const theta of [-2, -0.5, 0, 0.7, 2.4]) {
            const item: Item3pl = { a: 1, b: 0.3, c: 0 };
            expect(probability3pl(theta, item)).toBeCloseTo(raschProbability(SCALING_D * theta, SCALING_D * item.b), 12);
        }
    });

    it("не переполняется на крайних θ", () => {
        const item: Item3pl = { a: 3, b: 0, c: 0.25 };
        expect(Number.isFinite(probability3pl(1e6, item))).toBe(true);
        expect(Number.isFinite(probability3pl(-1e6, item))).toBe(true);
    });
});

describe("информационная функция", () => {
    it("совпадает с производной вероятности численно", () => {
        // I(θ) = (dP/dθ)² / (P(1−P)). Если формула из разбора набрана верно,
        // конечная разность обязана сойтись с аналитической производной.
        const item: Item3pl = { a: 1.4, b: 0.2, c: 0.22 };
        const h = 1e-6;
        for (const theta of [-1.5, 0, 1.1]) {
            const numeric = (probability3pl(theta + h, item) - probability3pl(theta - h, item)) / (2 * h);
            expect(probabilityDerivative3pl(theta, item)).toBeCloseTo(numeric, 6);

            const p = probability3pl(theta, item);
            const expected = (numeric * numeric) / (p * (1 - p));
            expect(itemInformation3pl(theta, item)).toBeCloseTo(expected, 6);
        }
    });

    it("угадывание информацию уменьшает — задание становится менее различающим", () => {
        const without: Item3pl = { a: 1, b: 0, c: 0 };
        const with25: Item3pl = { a: 1, b: 0, c: 0.25 };
        expect(itemInformation3pl(0, with25)).toBeLessThan(itemInformation3pl(0, without));
    });

    it("информация теста складывается, SE — нет", () => {
        const items: Item3pl[] = [{ a: 1, b: 0, c: 0.2 }, { a: 1.5, b: 1, c: 0.2 }];
        const total = testInformation3pl(0.5, items);
        expect(total).toBeCloseTo(itemInformation3pl(0.5, items[0]) + itemInformation3pl(0.5, items[1]), 12);
        expect(standardError3pl(total)).toBeCloseTo(1 / Math.sqrt(total), 12);
        expect(standardError3pl(0)).toBe(Infinity);
    });
});

describe("estimateTheta3pl — Ньютон-Рафсон", () => {
    const items: Item3pl[] = Array.from({ length: 30 }, (_, i) => ({
        a: 1 + (i % 5) * 0.15,
        b: -2 + i * 0.14,
        c: 0.25,
    }));

    it("восстанавливает θ, из которой сгенерированы ответы", () => {
        const random = mulberry32(7);
        for (const trueTheta of [-1.2, 0, 1.5]) {
            const responses: Response3pl[] = items.map((item) => ({
                correct: (random() < probability3pl(trueTheta, item) ? 1 : 0) as 0 | 1,
                item,
            }));
            const result = estimateTheta3pl(responses);
            expect(result.status).toBe("OK");
            // 30 заданий — выборка небольшая, поэтому допуск широкий: проверяем,
            // что оценка попадает в окрестность, а не совпадает до знака.
            expect(Math.abs(result.theta - trueTheta)).toBeLessThan(1.2);
        }
    });

    it("след итераций пригоден для проверки руками", () => {
        const responses: Response3pl[] = items.map((item, i) => ({ correct: (i % 2) as 0 | 1, item }));
        const result = estimateTheta3pl(responses);
        expect(result.trace.length).toBeGreaterThan(0);
        for (const step of result.trace) {
            // Вторая производная равна минус информации — это и есть проверка,
            // что на экране показывается не произвольное число.
            expect(step.secondDerivative).toBeLessThanOrEqual(0);
            expect(Number.isFinite(step.scoreFunction)).toBe(true);
            expect(Number.isFinite(step.theta)).toBe(true);
        }
    });

    it("балл ниже суммы угадываний не даёт конечной оценки", () => {
        // Особенность 3PL против Раша: ниже Σc правдоподобие монотонно, и
        // максимума у него нет. Такое помечается, а не выдумывается.
        const responses: Response3pl[] = items.map((item) => ({ correct: 0 as 0 | 1, item }));
        const result = estimateTheta3pl(responses);
        expect(result.status).toBe("EXTREME_SCORE");
        expect(Number.isFinite(result.theta)).toBe(true);
    });

    it("без ответов возвращает статус, а не ноль", () => {
        expect(estimateTheta3pl([]).status).toBe("NO_RESPONSES");
    });
});

// ═══════════════════════════════════════════════════════════════════════
// ГЛАВНОЕ: восстанавливает ли калибровка заложенные параметры и на какой
// выборке. Ответ на вопрос «работает ли она» — числом, а не мнением.
// ═══════════════════════════════════════════════════════════════════════

type TrueItem = Item3pl & { options: number };

const TRUE_ITEMS: TrueItem[] = Array.from({ length: 20 }, (_, i) => ({
    a: 0.8 + (i % 4) * 0.3,
    b: -1.5 + i * 0.16,
    c: 0.25,
    options: 4,
}));

function generate(personCount: number, seed: number): CalibrationItemInput[] {
    const random = mulberry32(seed);
    const thetas = Array.from({ length: personCount }, () => {
        // Приближение нормального через сумму равномерных: своё, чтобы тест
        // оставался детерминированным и не зависел от библиотек.
        let sum = 0;
        for (let i = 0; i < 12; i++) sum += random();
        return sum - 6;
    });
    return TRUE_ITEMS.map((item) => ({
        optionCount: item.options,
        responses: thetas.map((theta) => (random() < probability3pl(theta, item) ? 1 : 0) as 0 | 1),
    }));
}

function meanAbsoluteError(estimated: number[], truth: number[]): number {
    return estimated.reduce((sum, value, i) => sum + Math.abs(value - truth[i]), 0) / estimated.length;
}

describe("calibrate3pl на синтетике с ИЗВЕСТНЫМИ параметрами", () => {
    it("на большой выборке восстанавливает трудность заданий", () => {
        const result = calibrate3pl(generate(2000, 11));
        expect(result.items).toHaveLength(TRUE_ITEMS.length);
        const bError = meanAbsoluteError(result.items.map((i) => i.b), TRUE_ITEMS.map((i) => i.b));
        // Трудность — самый устойчивый из трёх параметров, на 2000 она
        // восстанавливается уверенно.
        expect(bError).toBeLessThan(0.45);
    }, 60000);

    it("НА НАШЕЙ ВЫБОРКЕ (36 человек) ошибка в разы больше — это и есть ответ", () => {
        const big = calibrate3pl(generate(2000, 11));
        const small = calibrate3pl(generate(36, 11));

        const bBig = meanAbsoluteError(big.items.map((i) => i.b), TRUE_ITEMS.map((i) => i.b));
        const bSmall = meanAbsoluteError(small.items.map((i) => i.b), TRUE_ITEMS.map((i) => i.b));

        // Сам факт, а не конкретное число: на 36 сдавших те же истинные
        // параметры восстанавливаются заметно хуже. Тест сторожит именно это
        // утверждение — на него ссылается экран сравнения.
        expect(bSmall).toBeGreaterThan(bBig);
    }, 60000);

    it("оценки детерминированы: повторный прогон даёт то же самое", () => {
        // Без этого доверять числам нельзя: «прозрачно» начинается с
        // воспроизводимости.
        const data = generate(200, 3);
        const first = calibrate3pl(data);
        const second = calibrate3pl(data);
        first.items.forEach((item, i) => {
            expect(item.a).toBeCloseTo(second.items[i].a, 12);
            expect(item.b).toBeCloseTo(second.items[i].b, 12);
            expect(item.c).toBeCloseTo(second.items[i].c, 12);
        });
    }, 60000);

    it("у задания со свободным ответом угадывание закреплено нулём", () => {
        const data = generate(200, 5).map((item, i) => (i === 0 ? { ...item, optionCount: null } : item));
        const result = calibrate3pl(data);
        expect(result.items[0].c).toBe(0);
        expect(result.items[0].status).toBe("FIXED_GUESSING");
    }, 60000);

    it("задание, которое не решил никто, помечается, а не уходит в бесконечность", () => {
        const data = generate(100, 9);
        const broken = data.map((item, i) =>
            i === 0 ? { ...item, responses: item.responses.map(() => 0 as 0 | 1) } : item,
        );
        const result = calibrate3pl(broken);
        expect(result.items[0].status).toBe("NONE_CORRECT");
        expect(Number.isFinite(result.items[0].a)).toBe(true);
        expect(Number.isFinite(result.items[0].b)).toBe(true);
    }, 60000);
});
