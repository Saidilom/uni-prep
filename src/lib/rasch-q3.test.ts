import { describe, it, expect } from "vitest";

// Остатки больше не знают модели: ожидание P(θ) приходит матрицей.
// Здесь она строится по Рашу — той же формулой, что раньше стояла
// внутри модуля, поэтому проверяемое поведение не изменилось.
function expectedMatrix(thetas: readonly number[], difficulties: readonly number[]) {
    return thetas.map((theta) => difficulties.map((b) => 1 / (1 + Math.exp(-(theta - b)))));
}
import {
    modelResiduals,
    standardizedResiduals,
    q3Baseline,
    q3Analysis,
    residualPca,
    Q3_EXCESS_THRESHOLD,
    Q3_MIN_PERSONS,
    PCA_EIGENVALUE_THRESHOLD,
} from "./rasch-q3";
import { estimateRasch, Observation } from "./rasch";

function mulberry32(seed: number) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.min(2147483647, seed) ^ (seed >>> 15);
        t = (Math.imul(t, 1 | seed) + Math.imul(t ^ (t >>> 7), 61 | seed)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const p = (theta: number, b: number) => 1 / (1 + Math.exp(-(theta - b)));

/**
 * Когорта, отвечающая РОВНО по модели: все задания независимы.
 *
 * Параметры ОЦЕНИВАЮТСЯ по этим же ответам, а не берутся истинными — так
 * модуль и вызывается в проде, и только так базовый уровень −1/(L−1) имеет
 * смысл. Первая версия теста подавала истинные θ и получила среднее
 * превышение ровно 1/(L−1): при истинных параметрах остатки ничем не связаны,
 * Q3 ≈ 0, и вычитание базового уровня становится ошибкой.
 */
function independentCohort(persons: number, items: number, seed: number) {
    const rand = mulberry32(seed);
    const trueThetas = Array.from({ length: persons }, (_, n) => -3 + (6 * n) / (persons - 1));
    const trueDifficulties = Array.from({ length: items }, (_, i) => -2 + (4 * i) / (items - 1));
    const responses: Array<Array<0 | 1 | null>> = trueThetas.map((theta) =>
        trueDifficulties.map((b) => (rand() < p(theta, b) ? 1 : 0) as 0 | 1),
    );
    const observations: Observation[] = [];
    responses.forEach((row, person) =>
        row.forEach((answer, item) => observations.push({ person, item, correct: answer as 0 | 1 })),
    );
    const estimated = estimateRasch(observations, persons, items);
    return {
        thetas: estimated.personAbility,
        difficulties: estimated.itemDifficulty,
        responses,
    };
}

describe("остатки модели", () => {
    it("residual = X − P(θ, b)", () => {
        const residuals = modelResiduals([[1, 0]], expectedMatrix([0.5], [0, 1]));
        expect(residuals[0][0]!).toBeCloseTo(1 - p(0.5, 0), 12);
        expect(residuals[0][1]!).toBeCloseTo(0 - p(0.5, 1), 12);
    });

    it("неотвеченное остаётся null, а не нулём", () => {
        // Ноль означал бы «ответил ровно по ожиданию», а это неправда.
        const residuals = modelResiduals([[1, null]], expectedMatrix([0], [0, 0]));
        expect(residuals[0][1]).toBeNull();
    });

    it("стандартизованные делятся на √(P(1−P))", () => {
        const z = standardizedResiduals([[1]], expectedMatrix([0], [0]))[0][0]!;
        expect(z).toBeCloseTo((1 - 0.5) / Math.sqrt(0.25), 12);
    });
});

describe("базовый уровень (§G.2)", () => {
    it("равен −1/(L−1)", () => {
        expect(q3Baseline(55)).toBeCloseTo(-1 / 54, 12);
        expect(q3Baseline(49)).toBeCloseTo(-1 / 48, 12);
        // Числа с реальных вариантов: −0.0185 и −0.0208.
        expect(q3Baseline(55)).toBeCloseTo(-0.0185, 4);
        expect(q3Baseline(49)).toBeCloseTo(-0.0208, 4);
    });

    it("на двух заданиях это −1, на одном не определён", () => {
        expect(q3Baseline(2)).toBe(-1);
        expect(q3Baseline(1)).toBe(0);
    });
});

describe("независимые задания не помечаются", () => {
    const { thetas, difficulties, responses } = independentCohort(600, 20, 4242);
    const residuals = modelResiduals(responses, expectedMatrix(thetas, difficulties));
    const analysis = q3Analysis(residuals);

    it("проверены все пары", () => {
        expect(analysis.itemCount).toBe(20);
        expect(analysis.pairs).toHaveLength((20 * 19) / 2);
    });

    it("среднее превышение около нуля", () => {
        // Базовый уровень вычтен, поэтому при независимости остаётся шум.
        expect(Math.abs(analysis.meanExcess!)).toBeLessThan(0.03);
    });

    it("ни одна пара не помечена зависимой", () => {
        expect(analysis.flaggedPairs).toHaveLength(0);
    });
});

// ГЛАВНЫЙ ТЕСТ ШАГА: подсаженная зависимость обязана быть найдена именно там,
// где она подсажена, и нигде больше.
describe("зависимость внутри testlet-группы находится (§G.1–G.2)", () => {
    const PERSONS = 600;
    const ITEMS = 20;
    // Задания 0–4 — вопросы к одному тексту: у них общий скрытый фактор
    // «понял текст», которого модель не знает.
    const GROUP = [0, 1, 2, 3, 4];

    const groupKeys = Array.from({ length: ITEMS }, (_, i) => (GROUP.includes(i) ? "text_1" : null));

    /**
     * Подсаживает общий скрытый фактор ТОЛЬКО заданиям группы: «понял текст».
     * Модель о нём не знает, поэтому он и обязан вылезти в остатках.
     *
     * Параметры оцениваются по этим же ответам — как в проде: базовый уровень
     * −1/(L−1) только тогда и имеет смысл.
     */
    function planted(bonusSize: number, seed: number) {
        const rand = mulberry32(seed);
        const thetas = Array.from({ length: PERSONS }, (_, n) => -3 + (6 * n) / (PERSONS - 1));
        const difficulties = Array.from({ length: ITEMS }, (_, i) => -2 + (4 * i) / (ITEMS - 1));
        const responses: Array<Array<0 | 1 | null>> = thetas.map((theta) => {
            const textBonus = (rand() < 0.5 ? 1 : -1) * bonusSize;
            return difficulties.map((b, item) => {
                const effective = GROUP.includes(item) ? theta + textBonus : theta;
                return (rand() < p(effective, b) ? 1 : 0) as 0 | 1;
            });
        });
        const observations: Observation[] = [];
        responses.forEach((row, person) =>
            row.forEach((answer, item) => observations.push({ person, item, correct: answer as 0 | 1 })),
        );
        const estimated = estimateRasch(observations, PERSONS, ITEMS);
        return q3Analysis(
            modelResiduals(responses, expectedMatrix(estimated.personAbility, estimated.itemDifficulty)),
            { groupKeys },
        );
    }

    // ±2.0 логиты — сила, при которой зависимость переходит порог 0.2 и при
    // этом ещё не портит саму калибровку (см. последний тест этого блока).
    const analysis = planted(2.0, 31337);

    it("помеченные пары есть, и они внутри группы", () => {
        expect(analysis.withinGroupPairs).toBe((5 * 4) / 2);
        // 9 из 10 пар группы: одна пара остаётся чуть ниже порога, и это
        // правильное поведение — порог задан, а не подогнан под тест.
        expect(analysis.flaggedWithinGroup).toBeGreaterThanOrEqual(9);
    });

    it("вне группы ложных срабатываний нет", () => {
        const outside = analysis.flaggedPairs.filter((pair) => !pair.sameGroup);
        expect(outside).toHaveLength(0);
    });

    it("превышение внутри группы заметно больше, чем вне неё", () => {
        const inside = analysis.pairs.filter((x) => x.sameGroup && x.excess !== null);
        const outside = analysis.pairs.filter((x) => !x.sameGroup && x.excess !== null);
        const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
        // Замер: внутри 0.290 против −0.016 вне.
        expect(mean(inside.map((x) => x.excess!)) - mean(outside.map((x) => x.excess!)))
            .toBeGreaterThan(Q3_EXCESS_THRESHOLD);
    });

    it("умеренная зависимость видна в среднем, но НЕ переходит порог", () => {
        // Честная граница метода: при ±1.2 логиты зависимость реальна —
        // внутри группы среднее превышение 0.097 против −0.005 вне, — но до
        // 0.2 не доходит, и ни одна пара не помечается. То есть порог 0.2
        // ловит сильную зависимость, а слабую пропускает, и знать это надо
        // до, а не после разбора живого варианта.
        const moderate = planted(1.2, 31337);
        expect(moderate.flaggedPairs).toHaveLength(0);
        const inside = moderate.pairs.filter((x) => x.sameGroup && x.excess !== null).map((x) => x.excess!);
        const outside = moderate.pairs.filter((x) => !x.sameGroup && x.excess !== null).map((x) => x.excess!);
        const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
        expect(mean(inside)).toBeGreaterThan(mean(outside) + 0.05);
    });

    it("очень сильная зависимость портит калибровку и даёт ложные флаги", () => {
        // Не косметика, а свойство, которое надо знать при разборе: θ
        // оценивается по ВСЕМ заданиям, включая зависимые, поэтому сильный
        // testlet искажает саму оценку и наводит ложные корреляции остатков
        // между независимыми заданиями. Замер: при ±4 логиты помечено 61 пар,
        // из них внутри группы только 10.
        const strong = planted(4.0, 31337);
        const falsePositives = strong.flaggedPairs.filter((pair) => !pair.sameGroup).length;
        expect(falsePositives).toBeGreaterThan(0);
        // Значит большое ЧИСЛО флагов — сам по себе сигнал: скорее всего
        // испорчена калибровка, а не «половина теста зависима».
        expect(strong.flaggedPairs.length).toBeGreaterThan(strong.withinGroupPairs * 2);
    });

    it("список отсортирован: самая сильная зависимость первой", () => {
        for (let i = 1; i < analysis.flaggedPairs.length; i++) {
            expect(analysis.flaggedPairs[i].excess!).toBeLessThanOrEqual(analysis.flaggedPairs[i - 1].excess!);
        }
    });

    it("НИЧЕГО не удаляется — только флаги (§222)", () => {
        // Все задания на месте, все пары посчитаны, ни одно поле не говорит
        // «исключить». Решение принимает человек.
        expect(analysis.pairs).toHaveLength((ITEMS * (ITEMS - 1)) / 2);
        expect(analysis.itemCount).toBe(ITEMS);
        expect(Object.keys(analysis)).not.toContain("removedItems");
    });
});

describe("порог вынесен в конфиг и работает", () => {
    const { thetas, difficulties, responses } = independentCohort(400, 12, 99);
    const residuals = modelResiduals(responses, expectedMatrix(thetas, difficulties));

    it("более мягкий порог ловит больше пар, более жёсткий — меньше", () => {
        const strict = q3Analysis(residuals, { threshold: 0.5 });
        const loose = q3Analysis(residuals, { threshold: 0.05 });
        expect(loose.flaggedPairs.length).toBeGreaterThanOrEqual(strict.flaggedPairs.length);
        expect(strict.threshold).toBe(0.5);
        expect(loose.threshold).toBe(0.05);
    });

    it("по умолчанию порог равен 0.2, как в спеке", () => {
        expect(q3Analysis(residuals).threshold).toBe(Q3_EXCESS_THRESHOLD);
        expect(Q3_EXCESS_THRESHOLD).toBe(0.2);
    });
});

describe("крайние случаи: статус, а не выдуманное число", () => {
    it("мало персон — TOO_FEW_PERSONS, и пара не считается зависимой", () => {
        const { thetas, difficulties, responses } = independentCohort(Q3_MIN_PERSONS - 1, 5, 7);
        const analysis = q3Analysis(modelResiduals(responses, expectedMatrix(thetas, difficulties)));
        for (const pair of analysis.pairs) expect(pair.flags).toContain("TOO_FEW_PERSONS");
        expect(analysis.flaggedPairs).toHaveLength(0);
    });

    it("нулевая дисперсия остатков — Q3 не существует, а не равен нулю", () => {
        // Все ответили одинаково на оба задания при одинаковой θ: разброса нет.
        const responses: Array<Array<0 | 1 | null>> = Array.from({ length: 30 }, () => [1, 1]);
        const analysis = q3Analysis(modelResiduals(responses, expectedMatrix(new Array(30).fill(0), [0, 0])));
        expect(analysis.pairs[0].q3).toBeNull();
        expect(analysis.pairs[0].excess).toBeNull();
    });

    it("разреженная матрица: считаются только персоны с ОБОИМИ ответами", () => {
        const responses: Array<Array<0 | 1 | null>> = [
            ...Array.from({ length: 20 }, (_, n) => [(n % 2) as 0 | 1, (n % 2) as 0 | 1]),
            ...Array.from({ length: 20 }, () => [1 as 0 | 1, null]),
        ];
        const thetas = new Array(40).fill(0);
        const analysis = q3Analysis(modelResiduals(responses, expectedMatrix(thetas, [0, 0])));
        expect(analysis.pairs[0].persons).toBe(20);
    });

    it("пустая матрица не роняет расчёт", () => {
        const analysis = q3Analysis([]);
        expect(analysis.itemCount).toBe(0);
        expect(analysis.pairs).toHaveLength(0);
        expect(analysis.maxExcess).toBeNull();
    });
});

describe("residual PCA (§G.3–G.4)", () => {
    it("на одномерных данных первый контраст мал", () => {
        const { thetas, difficulties, responses } = independentCohort(600, 20, 5150);
        const pca = residualPca(standardizedResiduals(responses, expectedMatrix(thetas, difficulties)));
        expect(pca.eigenvalues[0]).toBeLessThan(PCA_EIGENVALUE_THRESHOLD);
        expect(pca.flagged).toBe(false);
    });

    it("вторая размерность находится и помечается", () => {
        // Половина заданий меряет вторую способность, не связанную с первой.
        const PERSONS = 600, ITEMS = 20;
        const rand = mulberry32(777);
        const thetas = Array.from({ length: PERSONS }, (_, n) => -3 + (6 * n) / (PERSONS - 1));
        const difficulties = Array.from({ length: ITEMS }, (_, i) => -2 + (4 * i) / (ITEMS - 1));
        const responses: Array<Array<0 | 1 | null>> = thetas.map((theta) => {
            const second = (rand() < 0.5 ? 1 : -1) * 1.5;
            return difficulties.map((b, item) =>
                (rand() < p(item < ITEMS / 2 ? theta : theta + second, b) ? 1 : 0) as 0 | 1,
            );
        });
        const pca = residualPca(standardizedResiduals(responses, expectedMatrix(thetas, difficulties)));
        expect(pca.eigenvalues[0]).toBeGreaterThanOrEqual(PCA_EIGENVALUE_THRESHOLD);
        expect(pca.flagged).toBe(true);
    });

    it("собственные значения идут по убыванию", () => {
        const { thetas, difficulties, responses } = independentCohort(400, 15, 11);
        const pca = residualPca(standardizedResiduals(responses, expectedMatrix(thetas, difficulties)), { contrasts: 3 });
        expect(pca.eigenvalues).toHaveLength(3);
        for (let i = 1; i < pca.eigenvalues.length; i++) {
            expect(pca.eigenvalues[i]).toBeLessThanOrEqual(pca.eigenvalues[i - 1] + 1e-9);
        }
    });

    it("детерминизм: без ГПСЧ в самом разложении (§O.4)", () => {
        const { thetas, difficulties, responses } = independentCohort(300, 12, 3);
        const z = standardizedResiduals(responses, expectedMatrix(thetas, difficulties));
        expect(residualPca(z).eigenvalues).toEqual(residualPca(z).eigenvalues);
    });

    it("на одном задании контрастов нет", () => {
        const pca = residualPca([[0.5]]);
        expect(pca.eigenvalues).toHaveLength(0);
        expect(pca.flagged).toBe(false);
    });
});
