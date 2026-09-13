import { describe, it, expect } from "vitest";
import {
    testInformation,
    itemInformation,
    thetaConfidenceInterval,
    measurementPrecision,
    scoreConfidenceInterval,
    scoresAreDistinguishable,
    raschThetaToT,
    thetaSeToScoreSe,
    estimateRasch,
    Observation,
    LOW_INFORMATION_SE,
    MOCK_SCALE_MAX,
} from "./rasch";
import { REFERENCE_DEFAULT } from "./reference-population";

// Точность измерения. Появилась из вопроса владельца «почему баллы
// повторяются»: правильный ответ — потому что различить их тест не может, и
// это надо не скрывать, а показывать.

function mulberry32(seed: number) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.min(2147483647, seed) ^ (seed >>> 15);
        t = (Math.imul(t, 1 | seed) + Math.imul(t ^ (t >>> 7), 61 | seed)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const probability = (theta: number, b: number) => 1 / (1 + Math.exp(-(theta - b)));

describe("testInformation", () => {
    it("одно задание даёт максимум 0.25, и ровно там, где θ = b", () => {
        // D.1–D.2: задание информативнее всего, когда его сложность совпадает
        // со способностью. Это и есть основа таргетирования варианта.
        expect(testInformation(0, [0])).toBeCloseTo(0.25, 10);
        expect(testInformation(0, [1])).toBeLessThan(0.25);
        expect(testInformation(0, [-1])).toBeLessThan(0.25);
        expect(testInformation(2, [2])).toBeCloseTo(0.25, 10);
    });

    it("аддитивна по заданиям (D.3, D.5)", () => {
        const a = testInformation(0, [-1]);
        const b = testInformation(0, [1]);
        expect(testInformation(0, [-1, 1])).toBeCloseTo(a + b, 12);
    });

    it("на неподходящих заданиях почти не растёт", () => {
        // Десять заданий сильно выше уровня ученика дают меньше информации,
        // чем одно задание по его уровню.
        const targeted = testInformation(0, [0]);
        const tooHard = testInformation(0, new Array(10).fill(5));
        expect(tooHard).toBeLessThan(targeted);
    });

    it("нечисловые входы не портят сумму", () => {
        expect(testInformation(0, [0, Number.NaN, Number.POSITIVE_INFINITY])).toBeCloseTo(0.25, 10);
        expect(testInformation(Number.NaN, [0])).toBe(0);
    });
});

describe("measurementPrecision", () => {
    it("SE падает как 1/√n при добавлении однотипных заданий (D.4)", () => {
        const one = measurementPrecision(0, [0]);
        const four = measurementPrecision(0, [0, 0, 0, 0]);
        expect(one.thetaSe).not.toBeNull();
        expect(four.thetaSe).not.toBeNull();
        // Учетверение числа заданий уменьшает ошибку вдвое — не вчетверо.
        expect(four.thetaSe!).toBeCloseTo(one.thetaSe! / 2, 10);
    });

    it("одна логита ошибки стоит 10 баллов шкалы", () => {
        // Ровно один пункт информации даёт SE = 1 логита.
        const p = measurementPrecision(0, [0, 0, 0, 0]);
        expect(p.thetaSe).toBeCloseTo(1, 10);
        expect(p.scoreSe).toBeCloseTo(10, 10);
    });

    it("при нулевой информации возвращает СТАТУС, а не число (§217)", () => {
        // Ни одного задания — измерять нечем.
        const none = measurementPrecision(0, []);
        expect(none.status).toBe("INSUFFICIENT_INFORMATION");
        expect(none.thetaSe).toBeNull();
        expect(none.scoreSe).toBeNull();

        // Способность настолько далеко от всех заданий, что P(1−P) обнуляется
        // арифметически. Тут особенно важно не выдать 1/√0 = Infinity как балл.
        const far = measurementPrecision(-60, [0, 1, 2]);
        expect(far.status).toBe("INSUFFICIENT_INFORMATION");
        expect(far.thetaSe).toBeNull();
    });

    it("большую, но конечную ошибку помечает LOW_INFORMATION, а балл оставляет", () => {
        // §216: результат существует, но надёжным его называть нельзя. Балл
        // при этом не выбрасывается — различать «нет измерения» и «измерение
        // плохое» требует §215.
        const p = measurementPrecision(0, [0]);
        expect(p.status).toBe("LOW_INFORMATION");
        expect(p.thetaSe).toBeCloseTo(2, 10);
        expect(p.thetaSe!).toBeGreaterThanOrEqual(LOW_INFORMATION_SE);
    });

    it("граница LOW_INFORMATION стоит там, где интервал перестаёт помещаться в два уровня", () => {
        // Смысл порога: 1 логита = 10 баллов T, интервал ±19,6 балла. Полосы
        // уровней по 5 баллов, значит такой интервал накрывает больше двух.
        expect(LOW_INFORMATION_SE * 10 * 1.96).toBeGreaterThan(2 * 5);
    });
});

describe("scoreConfidenceInterval", () => {
    it("строит S ± 1.96·SE (D.7)", () => {
        const ci = scoreConfidenceInterval(50, 3)!;
        expect(ci.low).toBeCloseTo(50 - 1.96 * 3, 10);
        expect(ci.high).toBeCloseTo(50 + 1.96 * 3, 10);
    });

    it("не выходит за границы шкалы и потому у краёв несимметричен", () => {
        const low = scoreConfidenceInterval(2.4, 9)!;
        expect(low.low).toBe(0);
        expect(low.high).toBeGreaterThan(2.4);

        const high = scoreConfidenceInterval(74, 9)!;
        expect(high.high).toBe(MOCK_SCALE_MAX);
    });

    it("без погрешности интервала не существует", () => {
        expect(scoreConfidenceInterval(50, null)).toBeNull();
        expect(scoreConfidenceInterval(Number.NaN, 3)).toBeNull();
    });
});

describe("scoresAreDistinguishable (D.8)", () => {
    it("разница внутри погрешности не считается разницей", () => {
        // Именно этот случай стоит за вопросом «почему баллы близкие»: 31,4 и
        // 32,1 при SE ±3,9 — один и тот же результат.
        expect(scoresAreDistinguishable(31.4, 3.9, 32.1, 3.9)).toBe(false);
    });

    it("разницу заметно больше погрешности признаёт", () => {
        expect(scoresAreDistinguishable(27.9, 3.9, 57.9, 3.4)).toBe(true);
    });

    it("складывает ошибки квадратично, а не арифметически", () => {
        // SE(разности) = √(SE₁² + SE₂²) ≈ 4.24 при обеих по 3, значит порог
        // различимости ≈ 8.3 балла, а не 11.8.
        expect(scoresAreDistinguishable(50, 3, 59, 3)).toBe(true);
        expect(scoresAreDistinguishable(50, 3, 58, 3)).toBe(false);
    });

    it("без погрешности ответа нет — возвращает null, а не «различимы»", () => {
        expect(scoresAreDistinguishable(50, null, 60, 3)).toBeNull();
    });
});

// Главная проверка честности интервала: если он построен верно, истинная
// способность обязана попадать внутрь примерно в 95 случаях из 100. Это
// numerical-тест на самой модели, а не на формуле в отрыве от неё.
describe("интервал накрывает истинную способность в 95% случаев", () => {
    it("покрытие на синтетической когорте близко к номинальным 95%", () => {
        const PERSONS = 400;
        const ITEMS = 40;
        const rand = mulberry32(4242);
        const difficulties = Array.from({ length: ITEMS }, (_, i) => -2 + (4 * i) / (ITEMS - 1));
        const trueThetas = Array.from({ length: PERSONS }, (_, n) => -2 + (4 * n) / (PERSONS - 1));

        const observations: Observation[] = [];
        for (let p = 0; p < PERSONS; p++) {
            for (let i = 0; i < ITEMS; i++) {
                observations.push({ person: p, item: i, correct: rand() < probability(trueThetas[p], difficulties[i]) ? 1 : 0 });
            }
        }

        const { personAbility, itemDifficulty } = estimateRasch(observations, PERSONS, ITEMS);

        let covered = 0;
        let counted = 0;
        for (let p = 0; p < PERSONS; p++) {
            const { thetaSe, status } = measurementPrecision(personAbility[p], itemDifficulty);
            // Крайние баллы в покрытие не берём: у них оценка смещена по
            // построению (§19 — поправка Wright & Panchapakesan), и это
            // отдельная известная проблема, которую закрывает WLE (C.8).
            if (thetaSe === null || status !== "OK") continue;
            counted++;
            const trueT = raschThetaToT(trueThetas[p], REFERENCE_DEFAULT.mu, REFERENCE_DEFAULT.sigma);
            const estT = raschThetaToT(personAbility[p], REFERENCE_DEFAULT.mu, REFERENCE_DEFAULT.sigma);
            const ci = scoreConfidenceInterval(estT, thetaSe * 10)!;
            if (trueT >= ci.low && trueT <= ci.high) covered++;
        }

        const coverage = covered / counted;
        expect(counted).toBeGreaterThan(300);
        // Допуск широкий намеренно: JMLE на 40 заданиях даёт лёгкое смещение
        // (E.1 требует поправки (L−1)/L), поэтому идеальных 95% тут и не должно
        // быть. Проверяем, что интервал не врёт в разы.
        expect(coverage).toBeGreaterThan(0.85);
        expect(coverage).toBeLessThanOrEqual(1);
    });
});

// D.1 отдельной функцией: информация ОДНОГО задания. Раньше она жила только
// внутри суммы, и проверить «максимум 0.25 ровно при θ = b» было нельзя.
describe("itemInformation (D.1–D.2)", () => {
    it("максимум ровно 0.25 и ровно при θ = b", () => {
        for (const b of [-3, -1, 0, 1.5, 4]) {
            expect(itemInformation(b, b)).toBeCloseTo(0.25, 12);
            expect(itemInformation(b + 0.5, b)).toBeLessThan(0.25);
            expect(itemInformation(b - 0.5, b)).toBeLessThan(0.25);
        }
    });

    it("симметрична: одинаково далеко сверху и снизу — одинаково информативно", () => {
        expect(itemInformation(1, 0)).toBeCloseTo(itemInformation(-1, 0), 12);
    });

    it("информация теста есть в точности сумма информаций заданий (D.3)", () => {
        const bs = [-2, -0.5, 0, 0.7, 3];
        const sum = bs.reduce((acc, b) => acc + itemInformation(0.3, b), 0);
        expect(testInformation(0.3, bs)).toBeCloseTo(sum, 12);
    });

    it("нечисловые входы дают ноль, а не NaN", () => {
        expect(itemInformation(Number.NaN, 0)).toBe(0);
        expect(itemInformation(0, Number.NaN)).toBe(0);
    });
});

// D.7 в логитах: первичная величина, из которой балльный интервал получается
// линейным преобразованием.
describe("thetaConfidenceInterval (D.7)", () => {
    it("строит θ ± 1.96·SE и не зажимает — логит-шкала не имеет границ", () => {
        const ci = thetaConfidenceInterval(0.5, 0.3)!;
        expect(ci.low).toBeCloseTo(0.5 - 1.96 * 0.3, 12);
        expect(ci.high).toBeCloseTo(0.5 + 1.96 * 0.3, 12);
        // Отрицательная нижняя граница здесь нормальна, в отличие от баллов.
        expect(thetaConfidenceInterval(-2, 1)!.low).toBeLessThan(0);
    });

    it("балльный интервал есть образ θ-интервала при T = 10θ + 50", () => {
        // Проверяем именно эквивалентность двух путей: пересчитать концы
        // θ-интервала или взять балл ± 10·SE. Преобразование линейное, поэтому
        // результат обязан совпасть.
        const theta = -0.4;
        const thetaSe = 0.32;
        const { mu, sigma } = REFERENCE_DEFAULT;
        const viaTheta = thetaConfidenceInterval(theta, thetaSe)!;
        const viaScore = scoreConfidenceInterval(raschThetaToT(theta, mu, sigma), thetaSe * 10)!;
        expect(raschThetaToT(viaTheta.low, mu, sigma)).toBeCloseTo(viaScore.low, 10);
        expect(raschThetaToT(viaTheta.high, mu, sigma)).toBeCloseTo(viaScore.high, 10);
    });

    it("без погрешности интервала не существует", () => {
        expect(thetaConfidenceInterval(0, null)).toBeNull();
        expect(thetaConfidenceInterval(Number.NaN, 0.3)).toBeNull();
    });
});

describe("thetaSeToScoreSe — погрешность в баллах показанной шкалы", () => {
    it("делит на разброс потока, а не умножает на десять", () => {
        // T = 50 + 10(θ−μ)/σ, поэтому одна логита стоит 10/σ баллов.
        // Регрессия: прежде здесь стояло просто SE(θ)·10 — верно только при
        // σ = 1, то есть для эталонной популяции, которой в расчёте больше нет.
        expect(thetaSeToScoreSe(0.4, 1)).toBeCloseTo(4, 12);
        expect(thetaSeToScoreSe(0.4, 0.8)).toBeCloseTo(5, 12);
        expect(thetaSeToScoreSe(0.4, 2)).toBeCloseTo(2, 12);
    });

    it("согласуется с самим переводом θ в балл", () => {
        // Проверка не формулой, а поведением: сдвиг θ на одну SE обязан
        // сдвинуть балл ровно на вычисленную погрешность.
        const mu = -0.588;
        const sigma = 0.817;
        const thetaSe = 0.269;
        const theta = 0.2;
        const scoreSe = thetaSeToScoreSe(thetaSe, sigma)!;
        const moved = raschThetaToT(theta + thetaSe, mu, sigma) - raschThetaToT(theta, mu, sigma);
        expect(moved).toBeCloseTo(scoreSe, 10);
    });

    it("делится на число разделов итогового балла", () => {
        // Итог — среднее разделов, и вклад измеряемого раздела в погрешность
        // итога делится на их число (Baholash_mezoni.pdf стр. 4).
        expect(thetaSeToScoreSe(0.5, 1, 2)).toBeCloseTo(2.5, 12);
    });

    it("на испорченном разбросе возвращает отсутствие, а не число", () => {
        // Поток без разброса — это отсутствие измерения (§215, §233), и ноль
        // или Infinity здесь читались бы как измеренная точность.
        expect(thetaSeToScoreSe(0.4, 0)).toBeNull();
        expect(thetaSeToScoreSe(0.4, Number.NaN)).toBeNull();
        expect(thetaSeToScoreSe(null, 1)).toBeNull();
        expect(thetaSeToScoreSe(Number.POSITIVE_INFINITY, 1)).toBeNull();
        expect(thetaSeToScoreSe(0.4, 1, 0)).toBeNull();
    });
});
