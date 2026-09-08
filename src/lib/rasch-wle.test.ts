import { describe, it, expect } from "vitest";
import { estimateThetaWle, WLE_ESTIMATOR } from "./rasch-wle";
import { testInformation, measurementPrecision } from "./rasch";

// Задания от лёгких к трудным, как в настоящем варианте.
const spread = (n: number, from = -2, to = 2) =>
    Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

const build = (difficulties: number[], correctCount: number) =>
    difficulties.map((difficulty, i) => ({ correct: (i < correctCount ? 1 : 0) as 0 | 1, difficulty }));

describe("WLE даёт КОНЕЧНУЮ оценку там, где MLE уходит в бесконечность", () => {
    const difficulties = spread(55);

    it("ноль верных из 55 — конечная θ, а не −∞ и не подставленное число", () => {
        const r = estimateThetaWle(build(difficulties, 0));
        expect(r.status).toBe("OK");
        expect(Number.isFinite(r.theta)).toBe(true);
        // Оценка обязана быть заметно ниже всех сложностей, но внутри шкалы.
        expect(r.theta).toBeLessThan(Math.min(...difficulties));
        expect(r.theta).toBeGreaterThan(-8);
    });

    it("все 55 верны — тоже конечная θ, симметрично", () => {
        const r = estimateThetaWle(build(difficulties, 55));
        expect(r.status).toBe("OK");
        expect(Number.isFinite(r.theta)).toBe(true);
        expect(r.theta).toBeGreaterThan(Math.max(...difficulties));
        expect(r.theta).toBeLessThan(8);
    });

    it("нуль и максимум симметричны относительно средней сложности", () => {
        // Сложности симметричны вокруг нуля, значит и крайние оценки обязаны
        // быть симметричны — иначе в оценщике перекос.
        const low = estimateThetaWle(build(difficulties, 0)).theta;
        const high = estimateThetaWle(build(difficulties, 55)).theta;
        expect(low + high).toBeCloseTo(0, 6);
    });

    it("крайняя оценка не упирается в границу поиска", () => {
        // Если бы WLE не имел конечного корня, θ прижималась бы к ±8 — то есть
        // мы вернулись бы к подстановке числа, что §20 запрещает.
        for (const n of [10, 20, 55, 100]) {
            const d = spread(n);
            expect(Math.abs(estimateThetaWle(build(d, 0)).theta)).toBeLessThan(7.9);
            expect(Math.abs(estimateThetaWle(build(d, n)).theta)).toBeLessThan(7.9);
        }
    });

    it("чем длиннее тест, тем дальше уезжает крайняя оценка — и это верно", () => {
        // Ноль из 100 — более сильное свидетельство низкой способности, чем
        // ноль из 10. Оценка обязана это отражать.
        const short = estimateThetaWle(build(spread(10), 0)).theta;
        const long = estimateThetaWle(build(spread(100), 0)).theta;
        expect(long).toBeLessThan(short);
    });
});

describe("уравнение решено, а не приближено", () => {
    it("в найденной точке U_W(θ) = 0 с точностью допуска", () => {
        const difficulties = spread(40);
        for (const raw of [0, 1, 13, 27, 39, 40]) {
            const responses = build(difficulties, raw);
            const { theta } = estimateThetaWle(responses);
            // Пересчитываем U_W вручную по формуле из §C.8.
            let residual = 0, info = 0, j = 0;
            for (const r of responses) {
                const p = 1 / (1 + Math.exp(-(theta - r.difficulty)));
                const pq = p * (1 - p);
                residual += r.correct - p;
                info += pq;
                j += pq * (1 - 2 * p);
            }
            expect(Math.abs(residual + j / (2 * info))).toBeLessThan(1e-5);
        }
    });

    it("монотонность: больше верных — выше оценка", () => {
        const difficulties = spread(30);
        let prev = -Infinity;
        for (let raw = 0; raw <= 30; raw++) {
            const t = estimateThetaWle(build(difficulties, raw)).theta;
            expect(t).toBeGreaterThan(prev);
            prev = t;
        }
    });

    it("детерминизм: один вход — бит-в-бит один результат (§O.4)", () => {
        const responses = build(spread(25), 11);
        const a = estimateThetaWle(responses);
        const b = estimateThetaWle(responses);
        expect(a.theta).toBe(b.theta);
        expect(a.iterations).toBe(b.iterations);
    });

    it("estimator назван, чтобы WLE не выдавался за MLE (§C.8)", () => {
        const r = estimateThetaWle(build(spread(10), 5));
        expect(r.estimator).toBe(WLE_ESTIMATOR);
        expect(r.estimatorVersion).toBeTruthy();
    });
});

describe("крайние случаи возвращают статус", () => {
    it("без ответов — NO_RESPONSES, а не число (§217)", () => {
        const r = estimateThetaWle([]);
        expect(r.status).toBe("NO_RESPONSES");
        expect(Number.isNaN(r.theta)).toBe(true);
    });

    it("нечисловые сложности отбрасываются, а не портят оценку", () => {
        const good = estimateThetaWle(build(spread(10), 5));
        const withJunk = estimateThetaWle([
            ...build(spread(10), 5),
            { correct: 1, difficulty: Number.NaN },
        ]);
        expect(withJunk.theta).toBeCloseTo(good.theta, 10);
    });

    it("одно задание — оценка есть, но информации мало (§216)", () => {
        const r = estimateThetaWle([{ correct: 1, difficulty: 0 }]);
        expect(Number.isFinite(r.theta)).toBe(true);
        const precision = measurementPrecision(r.theta, [0]);
        expect(precision.status).toBe("LOW_INFORMATION");
    });
});

describe("информация из WLE совпадает с §D.3", () => {
    it("возвращённая I(θ) равна testInformation в той же точке", () => {
        const difficulties = spread(35);
        const r = estimateThetaWle(build(difficulties, 17));
        expect(r.information).toBeCloseTo(testInformation(r.theta, difficulties), 10);
    });
});
