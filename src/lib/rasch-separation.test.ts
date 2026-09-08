import { describe, it, expect } from "vitest";
import {
    computeSeparation,
    meetsHighStakes,
    RELIABILITY_HIGH_STAKES,
} from "./rasch-separation";
import { estimateRasch, measurementPrecision, itemPrecision, Observation } from "./rasch";

// Данные: когорта из N человек с заданной способностью против L заданий.
// Ответы детерминированные (порог по вероятности), чтобы тест не зависел от
// генератора и не мигал.
function cohort(abilities: number[], difficulties: number[]): Observation[] {
    const out: Observation[] = [];
    abilities.forEach((theta, p) => {
        difficulties.forEach((b, i) => {
            const prob = 1 / (1 + Math.exp(-(theta - b)));
            // Псевдослучайно, но воспроизводимо: дробная часть большого
            // иррационального произведения.
            const u = ((p + 1) * 0.7548776662 + (i + 1) * 0.5698402909) % 1;
            out.push({ person: p, item: i, correct: u < prob ? 1 : 0 });
        });
    });
    return out;
}

const spread = (n: number, from: number, to: number) =>
    Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

describe("computeSeparation — формулы §N.5", () => {
    it("G = SD_true / RMSE по определению", () => {
        // SD и RMSE подобраны так, чтобы SD_true считался в уме:
        // SD_obs² = 1.25, MSE = 0.25 → SD_true² = 1, SD_true = 1, RMSE = 0.5,
        // значит G = 2 ровно.
        const measures = [-Math.sqrt(1.25), Math.sqrt(1.25)];
        const r = computeSeparation(measures.map((measure) => ({ measure, se: 0.5 })));

        expect(r.status).toBe("OK");
        expect(r.sdObserved!).toBeCloseTo(Math.sqrt(1.25), 12);
        expect(r.rmse!).toBeCloseTo(0.5, 12);
        expect(r.sdTrue!).toBeCloseTo(1, 12);
        expect(r.separation!).toBeCloseTo(2, 12);
    });

    it("reliability = G²/(1+G²)", () => {
        // При G = 2 это 4/5.
        const measures = [-Math.sqrt(1.25), Math.sqrt(1.25)];
        const r = computeSeparation(measures.map((measure) => ({ measure, se: 0.5 })));
        expect(r.reliability!).toBeCloseTo(0.8, 12);
    });

    it("reliability совпадает с 1 − MSE/SD_obs² — то же число двумя путями", () => {
        // Тождество: G²/(1+G²) ≡ (SD_obs² − MSE)/SD_obs². Оно ловит ошибку в
        // любом из трёх шагов (вычитание дисперсий, деление, свёртка в 0…1) —
        // формулы разные, ответ обязан быть один.
        const estimates = [
            { measure: -1.9, se: 0.41 }, { measure: -0.8, se: 0.33 },
            { measure: -0.2, se: 0.31 }, { measure: 0.4, se: 0.32 },
            { measure: 1.1, se: 0.35 }, { measure: 2.3, se: 0.48 },
        ];
        const r = computeSeparation(estimates);

        const direct = 1 - (r.rmse! ** 2) / (r.sdObserved! ** 2);
        expect(r.reliability!).toBeCloseTo(direct, 12);
    });

    it("reliability лежит в 0…1 на широком диапазоне входов", () => {
        for (const se of [0.05, 0.2, 0.5, 0.9, 1.4]) {
            const r = computeSeparation(spread(30, -3, 3).map((measure) => ({ measure, se })));
            if (r.status !== "OK") continue;
            expect(r.reliability!).toBeGreaterThan(0);
            expect(r.reliability!).toBeLessThan(1);
        }
    });

    it("strata = (4G+1)/3", () => {
        const measures = [-Math.sqrt(1.25), Math.sqrt(1.25)];
        const r = computeSeparation(measures.map((measure) => ({ measure, se: 0.5 })));
        expect(r.strata!).toBeCloseTo((4 * 2 + 1) / 3, 12);
    });
});

describe("computeSeparation — крайние случаи возвращают статус, а не число (§217)", () => {
    it("погрешность больше разброса: NOT_SEPARABLE, а не нулевая надёжность", () => {
        // Разброс людей 0.5 логиты, а меряем с ошибкой 1.0 — настоящего
        // разброса под шумом не видно.
        const r = computeSeparation([
            { measure: -0.5, se: 1.0 },
            { measure: 0.0, se: 1.0 },
            { measure: 0.5, se: 1.0 },
        ]);
        expect(r.status).toBe("NOT_SEPARABLE");
        expect(r.separation).toBeNull();
        expect(r.reliability).toBeNull();
        expect(r.strata).toBeNull();
        // Наблюдаемые величины при этом известны и сохраняются — они и
        // объясняют, почему разделения нет.
        expect(r.sdObserved).not.toBeNull();
        expect(r.rmse).not.toBeNull();
        expect(r.rmse!).toBeGreaterThan(r.sdObserved!);
    });

    it("все оценки одинаковые: разброса нет вовсе", () => {
        const r = computeSeparation(Array.from({ length: 5 }, () => ({ measure: 1.2, se: 0.3 })));
        expect(r.status).toBe("NOT_SEPARABLE");
        expect(r.sdObserved!).toBe(0);
        expect(r.reliability).toBeNull();
    });

    it("ровно на границе SD_obs = RMSE не выдаёт ноль", () => {
        // SD_obs² = MSE ровно → SD_true² = 0. Ноль надёжности выглядел бы как
        // посчитанный результат, а его нет.
        const r = computeSeparation([{ measure: -0.5, se: 0.5 }, { measure: 0.5, se: 0.5 }]);
        expect(r.status).toBe("NOT_SEPARABLE");
        expect(r.reliability).toBeNull();
    });

    it("меньше двух оценок — TOO_FEW", () => {
        expect(computeSeparation([]).status).toBe("TOO_FEW");
        expect(computeSeparation([{ measure: 0.5, se: 0.3 }]).status).toBe("TOO_FEW");
    });

    it("оценки без погрешности не участвуют и не роняют расчёт в NaN", () => {
        const r = computeSeparation([
            { measure: -1.5, se: 0.4 }, { measure: 0.0, se: null },
            { measure: 1.5, se: 0.4 }, { measure: 2.0, se: Number.NaN },
            { measure: 3.0, se: 0 },
        ]);
        expect(r.count).toBe(2);
        expect(r.status).toBe("OK");
        expect(Number.isFinite(r.reliability!)).toBe(true);
    });
});

describe("computeSeparation — поведение, которого ждёт методист", () => {
    it("точнее меришь — выше и separation, и reliability", () => {
        const measures = spread(20, -2.5, 2.5);
        const coarse = computeSeparation(measures.map((measure) => ({ measure, se: 0.8 })));
        const fine = computeSeparation(measures.map((measure) => ({ measure, se: 0.3 })));

        expect(fine.separation!).toBeGreaterThan(coarse.separation!);
        expect(fine.reliability!).toBeGreaterThan(coarse.reliability!);
    });

    it("шире разброс когорты — выше надёжность при той же погрешности", () => {
        // Надёжность — свойство пары «тест + когорта», а не одного теста.
        const narrow = computeSeparation(spread(20, -0.7, 0.7).map((measure) => ({ measure, se: 0.35 })));
        const wide = computeSeparation(spread(20, -2.5, 2.5).map((measure) => ({ measure, se: 0.35 })));
        expect(wide.reliability!).toBeGreaterThan(narrow.reliability!);
    });

    it("один крайний балл с огромной SE заметно роняет надёжность", () => {
        // Обоснование фильтра в роуте: у ученика с нулём верных SE 1.84 против
        // 0.32 у остальных, и он входит в RMSE квадратом.
        const core = spread(19, -2, 2).map((measure) => ({ measure, se: 0.32 }));
        const without = computeSeparation(core);
        const withExtreme = computeSeparation([...core, { measure: -5.2, se: 1.84 }]);

        expect(withExtreme.reliability!).toBeLessThan(without.reliability!);
    });

    it("порядок оценок на результат не влияет", () => {
        const estimates = [
            { measure: -1.1, se: 0.4 }, { measure: 0.3, se: 0.31 },
            { measure: 1.7, se: 0.38 }, { measure: 2.4, se: 0.52 },
        ];
        const a = computeSeparation(estimates);
        const b = computeSeparation([...estimates].reverse());
        expect(a.reliability!).toBeCloseTo(b.reliability!, 12);
    });
});

describe("meetsHighStakes — ориентир §N.5", () => {
    it("сравнивает с 0.8 включительно", () => {
        expect(RELIABILITY_HIGH_STAKES).toBe(0.8);
        // G = 2 даёт ровно 0.8 — граница обязана считаться достигнутой.
        const exact = computeSeparation([
            { measure: -Math.sqrt(1.25), se: 0.5 }, { measure: Math.sqrt(1.25), se: 0.5 },
        ]);
        expect(meetsHighStakes(exact)).toBe(true);
    });

    it("неизмеримая надёжность — это не «дотягивает»", () => {
        const r = computeSeparation([{ measure: -0.5, se: 1.0 }, { measure: 0.5, se: 1.0 }]);
        expect(r.status).toBe("NOT_SEPARABLE");
        expect(meetsHighStakes(r)).toBe(false);
    });
});

describe("на данных, прошедших через модель", () => {
    // Здесь важно, что θ и b — ОЦЕНКИ из estimateRasch, а не подставленные
    // числа: separation считается по тому же выходу, что уходит в mock_results.
    const difficulties = spread(40, -2, 2);
    const abilities = spread(60, -2.5, 2.5);
    const estimated = estimateRasch(
        cohort(abilities, difficulties), abilities.length, difficulties.length,
    );

    it("считается по выходу estimateRasch без NaN", () => {
        const persons = estimated.personAbility.map((theta) => ({
            measure: theta,
            se: measurementPrecision(theta, estimated.itemDifficulty).thetaSe,
        }));
        const r = computeSeparation(persons);

        expect(r.status).toBe("OK");
        expect(Number.isFinite(r.separation!)).toBe(true);
        expect(Number.isFinite(r.reliability!)).toBe(true);
        expect(r.reliability!).toBeGreaterThan(0);
        expect(r.reliability!).toBeLessThan(1);
    });

    it("item separation считается той же функцией по другой оси", () => {
        const items = estimated.itemDifficulty.map((b) => ({
            measure: b,
            se: itemPrecision(b, estimated.personAbility).thetaSe,
        }));
        const r = computeSeparation(items);

        expect(r.count).toBe(difficulties.length);
        expect(r.status).toBe("OK");
        expect(Number.isFinite(r.reliability!)).toBe(true);
    });

    it("длиннее тест — выше person reliability", () => {
        // Больше заданий → меньше SE → больше separation. Проверяем на модели,
        // а не на подставленных SE.
        const reliabilityFor = (itemCount: number) => {
            const b = spread(itemCount, -2, 2);
            const est = estimateRasch(cohort(abilities, b), abilities.length, itemCount);
            return computeSeparation(est.personAbility.map((theta) => ({
                measure: theta,
                se: measurementPrecision(theta, est.itemDifficulty).thetaSe,
            }))).reliability!;
        };
        expect(reliabilityFor(60)).toBeGreaterThan(reliabilityFor(15));
    });
});
