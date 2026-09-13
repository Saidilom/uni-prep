import { describe, it, expect } from "vitest";

// Кривые перешли на 3PL: им нужны все три параметра. Тесты писались против
// модели Раша, поэтому трудность заворачивается в задание с a = 1 и c = 0 —
// это ровно кривая Раша, выраженная в терминах 3PL. Наклон при этом в D раз
// круче (масштабный коэффициент 1.702), и проверки, где важен именно
// наклон, отмечены отдельно.
import { testInformation3pl, SCALING_D } from "./irt-3pl";

const item = (b: number) => ({ a: 1, b, c: 0 });
const items = (bs: readonly number[]) => bs.map(item);
import {
    buildIcc, buildTcc, buildTif, buildWrightMap, buildItemInformationCurve,
    thetaRangeFor, THETA_LIMIT, DEFAULT_THETA_MIN, DEFAULT_THETA_MAX,
} from "./rasch-curves";
import { probability, testInformation } from "./rasch";

const spread = (n: number, from: number, to: number) =>
    Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

const RANGE = { min: -4, max: 4 };

describe("ICC (§D.12) — известные свойства кривой", () => {
    it("в точке θ = b вероятность ровно 0.5", () => {
        for (const b of [-2, -0.5, 0, 1.3, 3]) {
            expect(probability(b, b)).toBeCloseTo(0.5, 12);
        }
    });

    it("монотонно растёт по θ", () => {
        const curve = buildIcc(item(0.5), RANGE);
        for (let i = 1; i < curve.points.length; i++) {
            expect(curve.points[i].probability).toBeGreaterThan(curve.points[i - 1].probability);
        }
    });

    it("симметрична относительно b: P(b+x) = 1 − P(b−x)", () => {
        const b = 0.7;
        for (const x of [0.1, 0.9, 2.5]) {
            expect(probability(b + x, b)).toBeCloseTo(1 - probability(b - x, b), 12);
        }
    });

    it("остаётся в (0,1) на всём диапазоне", () => {
        const curve = buildIcc(item(-1.5), { min: -THETA_LIMIT, max: THETA_LIMIT });
        expect(curve.points.every((p) => p.probability > 0 && p.probability < 1)).toBe(true);
    });

    it("труднее задание — кривая правее", () => {
        const easy = buildIcc(item(-1), RANGE);
        const hard = buildIcc(item(1), RANGE);
        easy.points.forEach((p, i) => {
            expect(p.probability).toBeGreaterThan(hard.points[i].probability);
        });
    });
});

describe("TCC (§D.11) — ожидаемый сырой балл", () => {
    const difficulties = spread(20, -2, 2);

    it("растёт от 0 до числа заданий", () => {
        const tcc = buildTcc(items(difficulties), { min: -THETA_LIMIT, max: THETA_LIMIT });
        const first = tcc.points[0].expectedScore;
        const last = tcc.points[tcc.points.length - 1].expectedScore;
        expect(first).toBeGreaterThan(0);
        expect(first).toBeLessThan(1);
        expect(last).toBeGreaterThan(difficulties.length - 1);
        expect(last).toBeLessThan(difficulties.length);
    });

    it("монотонна", () => {
        const tcc = buildTcc(items(difficulties), RANGE);
        for (let i = 1; i < tcc.points.length; i++) {
            expect(tcc.points[i].expectedScore).toBeGreaterThan(tcc.points[i - 1].expectedScore);
        }
    });

    it("при симметричных сложностях середина даёт половину заданий", () => {
        // Σ P(0, b) при b, симметричных относительно нуля, — это L/2.
        const symmetric = [-2, -1, 0, 1, 2];
        const tcc = buildTcc(items(symmetric), RANGE);
        const atZero = tcc.points.reduce((best, p) =>
            Math.abs(p.theta) < Math.abs(best.theta) ? p : best);
        expect(atZero.theta).toBeCloseTo(0, 6);
        expect(atZero.expectedScore).toBeCloseTo(symmetric.length / 2, 6);
    });

    it("производная TCC связана с информацией теста множителем D·a", () => {
        // В модели Раша это было простое тождество dE/dθ = I(θ), потому что
        // там P′ = P(1−P). В 3PL P′ = D·a·P(1−P) при c = 0, а информация —
        // (P′)²/(P(1−P)) = D²a²·P(1−P). Значит I = D·a·dE/dθ, и тождество
        // распадается на множитель. Тест ловит ошибку в любой из двух кривых
        // ровно так же, как раньше.
        const range = { min: -3, max: 3 };
        const tcc = buildTcc(items(difficulties), range, 601);
        for (const i of [100, 300, 500]) {
            const dTheta = tcc.points[i + 1].theta - tcc.points[i - 1].theta;
            const slope = (tcc.points[i + 1].expectedScore - tcc.points[i - 1].expectedScore) / dTheta;
            const information = testInformation3pl(tcc.points[i].theta, items(difficulties));
            expect(information).toBeCloseTo(SCALING_D * slope, 4);
        }
    });
});

describe("TIF (§D.3) — информация и точность", () => {
    it("пик стоит там, где сгущены сложности", () => {
        const tif = buildTif(items(spread(30, 0.8, 1.2)), [], RANGE);
        expect(tif.peak.theta).toBeCloseTo(1.0, 1);
    });

    it("у одного задания пик ровно на его сложности, значение D²/4", () => {
        // Максимум информации в 3PL при a = 1, c = 0 равен D²·P(1−P) = D²/4,
        // а не 1/4 как в модели Раша: масштабный коэффициент 1.702 входит в
        // информацию квадратом.
        const tif = buildTif(items([0.6]), [], RANGE);
        expect(tif.peak.theta).toBeCloseTo(0.6, 3);
        expect(tif.peak.information).toBeCloseTo((SCALING_D * SCALING_D) / 4, 6);
    });

    it("SE согласована с той, что уходит в балл ученика", () => {
        // Кривая обязана давать ту же точность, что measurementPrecision, —
        // иначе график обещал бы одно, а в mock_results лежало бы другое.
        const difficulties = spread(40, -2, 2);
        const tif = buildTif(items(difficulties), [], RANGE);
        for (const point of [tif.points[40], tif.points[80], tif.points[120]]) {
            // Сверяется с ТОЙ ЖЕ информацией 3PL, из которой считается SE в
            // расчёте балла: иначе график обещал бы одну точность, а в
            // mock_results лежала бы другая.
            const information = testInformation3pl(point.theta, items(difficulties));
            expect(point.information).toBeCloseTo(information, 12);
            expect(point.se!).toBeCloseTo(1 / Math.sqrt(information), 12);
        }
    });

    it("двугорбая информация: пик не уезжает в ложную вершину между горбами", () => {
        // Тернарный поиск здесь сошёлся бы к провалу посередине.
        const twoClusters = [...spread(15, -2.2, -1.8), ...spread(15, 1.8, 2.2)];
        const tif = buildTif(items(twoClusters), [], RANGE);
        expect(Math.abs(tif.peak.theta)).toBeGreaterThan(1.5);
        // И это действительно максимум, а не случайная точка.
        const atPeak = tif.peak.information;
        expect(atPeak).toBeGreaterThan(testInformation(0, twoClusters));
    });

    it("больше заданий — больше информации всюду", () => {
        const few = buildTif(items(spread(10, -2, 2)), [], RANGE);
        const many = buildTif(items(spread(40, -2, 2)), [], RANGE);
        few.points.forEach((p, i) => {
            expect(many.points[i].information).toBeGreaterThan(p.information);
        });
    });
});

describe("нацеливание (§D.9) — то, ради чего рисуется TIF", () => {
    const difficulties = spread(30, 0.5, 1.5);

    it("когорта в оптимуме — штрафа нет", () => {
        const tif = buildTif(items(difficulties), spread(20, 0.9, 1.1), RANGE);
        expect(Math.abs(tif.targetingGap!)).toBeLessThan(0.2);
        expect(tif.sePenalty!).toBeCloseTo(1, 1);
    });

    it("когорта в стороне — знак разрыва показывает, куда именно", () => {
        // Тест труднее, чем нужен группе: центр когорты ЛЕВЕЕ оптимума.
        const tif = buildTif(items(difficulties), spread(20, -2.5, -1.5), RANGE);
        expect(tif.targetingGap!).toBeLessThan(0);
        // И точность в центре когорты заметно хуже оптимума.
        expect(tif.sePenalty!).toBeGreaterThan(1.5);
    });

    it("штраф считается именно как отношение SE, а не информации", () => {
        const tif = buildTif(items(difficulties), spread(20, -2, -1), RANGE);
        expect(tif.sePenalty!).toBeCloseTo(tif.atCohort!.se! / tif.peak.se!, 12);
    });

    it("без учеников разметка нацеливания пуста, а не занулена", () => {
        const tif = buildTif(items(difficulties), [], RANGE);
        expect(tif.cohort).toBeNull();
        expect(tif.atCohort).toBeNull();
        expect(tif.targetingGap).toBeNull();
        expect(tif.sePenalty).toBeNull();
    });
});

describe("карта Райта (§D.10)", () => {
    it("считает учеников и задания в общих корзинах", () => {
        const map = buildWrightMap([-1, -1, 0, 1], [0, 0, 2], { min: -2, max: 2 }, 4);
        expect(map.bins.reduce((s, b) => s + b.persons, 0)).toBe(4);
        expect(map.bins.reduce((s, b) => s + b.items, 0)).toBe(3);
    });

    it("крайняя мера не выпадает за карту", () => {
        // Значение ровно на правой границе должно попасть в последнюю корзину.
        const map = buildWrightMap([2], [-2], { min: -2, max: 2 }, 4);
        expect(map.bins[map.bins.length - 1].persons).toBe(1);
        expect(map.bins[0].items).toBe(1);
    });

    it("coverage — доля учеников внутри диапазона сложностей", () => {
        const map = buildWrightMap([-3, 0, 0, 3], [-1, 1], { min: -4, max: 4 }, 8);
        // Внутри [−1, 1] оказались двое из четырёх.
        expect(map.coverage).toBeCloseTo(0.5, 12);
    });

    it("находит полосы, где ученики есть, а заданий нет", () => {
        const map = buildWrightMap([-3.5, -3.4], [0, 0.5, 1], { min: -4, max: 2 }, 6);
        expect(map.gaps.length).toBeGreaterThan(0);
        expect(map.gaps.reduce((s, g) => s + g.persons, 0)).toBe(2);
    });

    it("считает задания вне досягаемости когорты", () => {
        // Прямой счётчик нацеливания: на проде это 13 заданий из 55 выше
        // способности лучшего ученика.
        const map = buildWrightMap([-1, 0, 0.5], [-3, -1, 0, 2, 3], { min: -4, max: 4 }, 8);
        expect(map.itemsAbovePersons).toBe(2);
        expect(map.itemsBelowPersons).toBe(1);
    });

    it("задание ровно на границе когорты недосягаемым не считается", () => {
        const map = buildWrightMap([0, 1], [1, -0], { min: -2, max: 2 }, 4);
        expect(map.itemsAbovePersons).toBe(0);
        expect(map.itemsBelowPersons).toBe(0);
    });

    it("пустые входы не роняют расчёт", () => {
        const map = buildWrightMap([], [], { min: -2, max: 2 }, 4);
        expect(map.persons).toBeNull();
        expect(map.items).toBeNull();
        expect(map.coverage).toBeNull();
        expect(map.gaps).toEqual([]);
        expect(map.itemsAbovePersons).toBe(0);
        expect(map.itemsBelowPersons).toBe(0);
    });
});

describe("диапазон оси", () => {
    it("покрывает и учеников, и задания", () => {
        const range = thetaRangeFor([-2.5, 0], [3.2], 1);
        expect(range.min).toBeLessThanOrEqual(-3.5);
        expect(range.max).toBeGreaterThanOrEqual(4.2);
    });

    it("не уходит за жёсткий предел", () => {
        const range = thetaRangeFor([-99], [99], 1);
        expect(range.min).toBe(-THETA_LIMIT);
        expect(range.max).toBe(THETA_LIMIT);
    });

    it("пустые входы дают диапазон по умолчанию", () => {
        expect(thetaRangeFor([], [])).toEqual({ min: DEFAULT_THETA_MIN, max: DEFAULT_THETA_MAX });
    });

    it("совпавшие меры не дают диапазон нулевой ширины", () => {
        // Иначе деление на (max−min) при отрисовке даёт NaN в координатах.
        const range = thetaRangeFor([1.5, 1.5], [1.5], 0);
        expect(range.max).toBeGreaterThan(range.min);
    });
});

describe("вклад одного задания в информацию", () => {
    it("максимум 0.25 на своей сложности", () => {
        const curve = buildItemInformationCurve(item(-0.8), RANGE);
        const peak = curve.reduce((best, p) => (p.information > best.information ? p : best));
        const maximum = (SCALING_D * SCALING_D) / 4;
        expect(peak.theta).toBeCloseTo(-0.8, 1);
        expect(peak.information).toBeLessThanOrEqual(maximum);
        expect(peak.information).toBeGreaterThan(maximum * 0.99);
    });

    it("сумма вкладов равна информации теста", () => {
        const difficulties = [-1.5, -0.3, 0.4, 1.8];
        const curves = difficulties.map((b) => buildItemInformationCurve(item(b), RANGE));
        const tif = buildTif(items(difficulties), [], RANGE);
        tif.points.forEach((point, i) => {
            const sum = curves.reduce((acc, c) => acc + c[i].information, 0);
            expect(sum).toBeCloseTo(point.information, 12);
        });
    });
});
