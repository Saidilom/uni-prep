import { describe, it, expect } from "vitest";
import {
    standardizedResidual,
    computeFit,
    mnsqToZstd,
    pointMeasureCorrelation,
    itemFitReport,
    personFitReport,
    FitObservation,
    MISFIT_LOW,
    MISFIT_HIGH,
    MIN_FIT_OBSERVATIONS,
} from "./rasch-fit";

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

// Когорта, отвечающая РОВНО по модели: fit на ней обязан лежать около 1.0.
function byModel(difficulty: number, persons: number, seed: number): FitObservation[] {
    const rand = mulberry32(seed);
    return Array.from({ length: persons }, (_, n) => {
        const theta = -3 + (6 * n) / (persons - 1);
        return { correct: (rand() < p(theta, difficulty) ? 1 : 0) as 0 | 1, theta, difficulty };
    });
}

describe("standardizedResidual (§F.3)", () => {
    it("равен (X − P)/√(P(1−P))", () => {
        for (const [theta, b, x] of [[0, 0, 1], [1, -1, 0], [-2, 1, 1]] as const) {
            const prob = p(theta, b);
            const expected = (x - prob) / Math.sqrt(prob * (1 - prob));
            expect(standardizedResidual(x as 0 | 1, theta, b)!).toBeCloseTo(expected, 12);
        }
    });

    it("верный ответ на трудное задание даёт большой положительный остаток", () => {
        // θ на две логиты ниже сложности: P ≈ 0.12, и верный ответ неожидан.
        const z = standardizedResidual(1, -2, 0)!;
        expect(z).toBeGreaterThan(2);
    });

    it("неверный ответ на лёгкое — большой отрицательный", () => {
        expect(standardizedResidual(0, 2, 0)!).toBeLessThan(-2);
    });

    it("ответ ровно по ожиданию даёт остаток около нуля", () => {
        // При θ = b вероятность 0.5, и любой из двух ответов даёт |z| = 1.
        expect(Math.abs(standardizedResidual(1, 0, 0)!)).toBeCloseTo(1, 12);
        expect(Math.abs(standardizedResidual(0, 0, 0)!)).toBeCloseTo(1, 12);
    });
});

describe("Outfit и Infit (§F.4–F.5)", () => {
    it("считаются точно по своим формулам", () => {
        const obs: FitObservation[] = [
            { correct: 1, theta: 0, difficulty: 0 },
            { correct: 0, theta: 1, difficulty: -1 },
            { correct: 1, theta: -1, difficulty: 1 },
        ];
        let sumZ2 = 0, sumRes2 = 0, sumW = 0;
        for (const o of obs) {
            const prob = p(o.theta, o.difficulty);
            const w = prob * (1 - prob);
            const r = o.correct - prob;
            sumZ2 += (r * r) / w;
            sumRes2 += r * r;
            sumW += w;
        }
        const fit = computeFit(obs);
        expect(fit.outfit!).toBeCloseTo(sumZ2 / obs.length, 12);
        expect(fit.infit!).toBeCloseTo(sumRes2 / sumW, 12);
    });

    it("на данных, порождённых моделью, оба около 1.0 (§F.7)", () => {
        const fit = computeFit(byModel(0, 4000, 424242));
        expect(fit.observations).toBe(4000);
        expect(fit.outfit!).toBeGreaterThan(0.9);
        expect(fit.outfit!).toBeLessThan(1.1);
        expect(fit.infit!).toBeGreaterThan(0.9);
        expect(fit.infit!).toBeLessThan(1.1);
    });

    it("Outfit чувствительнее к выбросам, чем Infit (§F.4 против §F.5)", () => {
        // Берём чистую по модели когорту и портим ОДИН ответ на краю: сильный
        // ученик проваливает лёгкое задание. Outfit обязан подскочить заметно
        // сильнее, потому что там наблюдение входит без веса.
        const clean = byModel(0, 200, 7);
        const spoiled = [...clean, { correct: 0 as 0 | 1, theta: 5, difficulty: -3 }];
        const a = computeFit(clean);
        const b = computeFit(spoiled);
        expect(b.outfit! - a.outfit!).toBeGreaterThan(b.infit! - a.infit!);
    });

    it("зависимые (слишком предсказуемые) ответы дают overfit ниже 1", () => {
        // Ответы строго по правилу «θ > b — верно»: разброса, который модель
        // ждёт, нет вовсе. Это §F.8, overfit.
        const obs: FitObservation[] = Array.from({ length: 200 }, (_, n) => {
            const theta = -3 + (6 * n) / 199;
            return { correct: (theta > 0 ? 1 : 0) as 0 | 1, theta, difficulty: 0 };
        });
        const fit = computeFit(obs);
        expect(fit.outfit!).toBeLessThan(MISFIT_LOW);
    });

    it("угадывание даёт underfit выше 1", () => {
        // Ответы случайны и со способностью не связаны — шум, который модель
        // не ждёт (§F.8, underfit; опаснее для измерения).
        const rand = mulberry32(99);
        const obs: FitObservation[] = Array.from({ length: 400 }, (_, n) => {
            const theta = -3 + (6 * n) / 399;
            return { correct: (rand() < 0.5 ? 1 : 0) as 0 | 1, theta, difficulty: 0 };
        });
        expect(computeFit(obs).outfit!).toBeGreaterThan(MISFIT_HIGH);
    });

    it("без пригодных наблюдений возвращает null, а не 1.0", () => {
        const empty = computeFit([]);
        expect(empty.outfit).toBeNull();
        expect(empty.infit).toBeNull();
        expect(empty.observations).toBe(0);
        // Нечисловые входы не превращаются в наблюдения.
        expect(computeFit([{ correct: 1, theta: Number.NaN, difficulty: 0 }]).observations).toBe(0);
    });
});

describe("ZSTD, Wilson–Hilferty (§F.9)", () => {
    it("MNSQ = 1 даёт ZSTD около нуля", () => {
        // Идеальное соответствие не должно выглядеть значимым отклонением.
        expect(mnsqToZstd(1, 0.05)!).toBeCloseTo(Math.sqrt(0.05) / 3, 12);
        expect(Math.abs(mnsqToZstd(1, 0.05)!)).toBeLessThan(0.1);
    });

    it("знак ZSTD следует за стороной отклонения", () => {
        expect(mnsqToZstd(1.6, 0.05)!).toBeGreaterThan(0);
        expect(mnsqToZstd(0.4, 0.05)!).toBeLessThan(0);
    });

    it("при одном MNSQ большая выборка даёт больший |ZSTD| (§F.9)", () => {
        // Меньше дисперсия статистики — увереннее вывод. Отсюда и
        // предупреждение спеки: на больших выборках ZSTD раздувается, и
        // приоритет остаётся у MNSQ.
        const small = mnsqToZstd(1.3, 0.2)!;
        const large = mnsqToZstd(1.3, 0.02)!;
        expect(large).toBeGreaterThan(small);
    });

    it("вырожденные входы дают null, а не число", () => {
        expect(mnsqToZstd(0, 0.05)).toBeNull();
        expect(mnsqToZstd(1, 0)).toBeNull();
        expect(mnsqToZstd(Number.NaN, 0.05)).toBeNull();
    });

    it("на данных по модели |ZSTD| остаётся небольшим", () => {
        const fit = computeFit(byModel(0, 2000, 5150));
        expect(Math.abs(fit.outfitZstd!)).toBeLessThan(3);
        expect(Math.abs(fit.infitZstd!)).toBeLessThan(3);
    });
});

describe("point-measure correlation (§F.11)", () => {
    it("положительна, когда сильные решают задание чаще", () => {
        const pairs = Array.from({ length: 100 }, (_, n) => {
            const theta = -3 + (6 * n) / 99;
            return { score: theta > 0 ? 1 : 0, theta };
        });
        expect(pointMeasureCorrelation(pairs)!).toBeGreaterThan(0.7);
    });

    it("ОТРИЦАТЕЛЬНА при перепутанном ключе", () => {
        // Ровно то, что ловит §221: ключ инвертирован, и сильные «проваливают»
        // задание чаще слабых.
        const pairs = Array.from({ length: 100 }, (_, n) => {
            const theta = -3 + (6 * n) / 99;
            return { score: theta > 0 ? 0 : 1, theta };
        });
        expect(pointMeasureCorrelation(pairs)!).toBeLessThan(-0.7);
    });

    it("около нуля, когда задание не связано со способностью", () => {
        const rand = mulberry32(31);
        const pairs = Array.from({ length: 500 }, (_, n) => ({
            score: rand() < 0.5 ? 1 : 0,
            theta: -3 + (6 * n) / 499,
        }));
        // Порог 0.1 — не на глаз: при ρ = 0 и N = 500 стандартная ошибка
        // корреляции равна 1/√499 ≈ 0.045, значит 0.1 это чуть больше двух SE.
        expect(Math.abs(pointMeasureCorrelation(pairs)!)).toBeLessThan(0.1);
    });

    it("не существует, когда все ответили одинаково", () => {
        // Нулевая дисперсия по одной из осей: возвращать 0 значило бы выдать
        // «связи нет» за установленный факт.
        const same = Array.from({ length: 20 }, (_, n) => ({ score: 1, theta: n * 0.1 }));
        expect(pointMeasureCorrelation(same)).toBeNull();
        const flat = Array.from({ length: 20 }, (_, n) => ({ score: n % 2, theta: 0 }));
        expect(pointMeasureCorrelation(flat)).toBeNull();
        expect(pointMeasureCorrelation([{ score: 1, theta: 0 }])).toBeNull();
    });
});

describe("флаги: помечаем, но НЕ удаляем (§224)", () => {
    it("исправное задание не получает ни одного флага", () => {
        const report = itemFitReport(byModel(0, 500, 1234));
        expect(report.flags).toEqual([]);
        expect(report.misfitDirection).toBeNull();
    });

    it("угадывание помечается MISFIT_UNDERFIT", () => {
        const rand = mulberry32(77);
        const obs: FitObservation[] = Array.from({ length: 400 }, (_, n) => {
            const theta = -3 + (6 * n) / 399;
            return { correct: (rand() < 0.5 ? 1 : 0) as 0 | 1, theta, difficulty: 0 };
        });
        const report = itemFitReport(obs);
        expect(report.flags).toContain("MISFIT_UNDERFIT");
        expect(report.misfitDirection).toBe("UNDERFIT");
    });

    it("слишком предсказуемое задание помечается MISFIT_OVERFIT", () => {
        const obs: FitObservation[] = Array.from({ length: 200 }, (_, n) => {
            const theta = -3 + (6 * n) / 199;
            return { correct: (theta > 0 ? 1 : 0) as 0 | 1, theta, difficulty: 0 };
        });
        const report = itemFitReport(obs);
        expect(report.flags).toContain("MISFIT_OVERFIT");
        expect(report.misfitDirection).toBe("OVERFIT");
    });

    it("перепутанный ключ даёт NEGATIVE_POINT_MEASURE (§221)", () => {
        const obs: FitObservation[] = Array.from({ length: 200 }, (_, n) => {
            const theta = -3 + (6 * n) / 199;
            return { correct: (theta > 0 ? 0 : 1) as 0 | 1, theta, difficulty: 0 };
        });
        const report = itemFitReport(obs);
        expect(report.pointMeasure!).toBeLessThan(0);
        expect(report.flags).toContain("NEGATIVE_POINT_MEASURE");
        // И это ФЛАГ: отчёт не «удаляет» задание и не отдаёт статус INVALID.
        expect(report.infit).not.toBeNull();
        expect(report.observations).toBe(200);
    });

    it("на малой выборке о fit не судим", () => {
        const report = itemFitReport(byModel(0, MIN_FIT_OBSERVATIONS - 1, 3));
        expect(report.flags).toContain("TOO_FEW_OBSERVATIONS");
        expect(report.misfitDirection).toBeNull();
    });

    it("порог «около нуля» сжимается с ростом выборки, а не задан константой", () => {
        // При ρ = 0 стандартная ошибка корреляции ≈ 1/√(N−1). Значит ОДНА И ТА
        // ЖЕ слабая связь на большой выборке уже значима, а на малой — нет.
        //
        // Связь строится детерминированно, без ГПСЧ: иначе на 20 человек
        // случайный разброс сам решает знак корреляции, и тест проверял бы
        // жеребьёвку вместо порога. (Первая версия теста именно на это и
        // упала: на N = 20 слабая связь вышла отрицательной.)
        const weak = (persons: number): FitObservation[] => {
            const half = Math.floor(persons / 2);
            return Array.from({ length: persons }, (_, n) => {
                const theta = -3 + (6 * n) / (persons - 1);
                const upper = n >= half;
                // Доля считается ВНУТРИ половины, а не по глобальному индексу:
                // при persons = 20 глобальный n % 10 совпадает с n, и половины
                // переворачивались.
                const posInHalf = upper ? n - half : n;
                // 60% верных в верхней половине против 50% в нижней — r ≈ 0.1
                // при любом размере выборки.
                const share = upper ? 6 : 5;
                // Верные РАЗМАЗАНЫ по половине, а не идут блоком с её начала:
                // (pos·share mod 10) даёт ровно `share` попаданий на десяток и
                // при этом чередует их. Блочная раскладка создавала сильную
                // отрицательную связь ВНУТРИ половины, которая перебивала
                // разницу МЕЖДУ половинами — на этом тест падал дважды.
                return { correct: (((posInHalf * share) % 10) < share ? 1 : 0) as 0 | 1, theta, difficulty: 0 };
            });
        };

        const small = itemFitReport(weak(20));
        const large = itemFitReport(weak(4000));
        // Корреляция одна и та же, положительная и слабая.
        expect(small.pointMeasure!).toBeGreaterThan(0);
        expect(large.pointMeasure!).toBeGreaterThan(0);
        expect(Math.abs(small.pointMeasure! - large.pointMeasure!)).toBeLessThan(0.1);
        // А вывод разный, и это правильно: 1.96/√19 = 0.45 против 1.96/√3999 = 0.031.
        expect(small.flags).toContain("WEAK_POINT_MEASURE");
        expect(large.flags).not.toContain("WEAK_POINT_MEASURE");
    });
});

describe("персоны: тот же аппарат (§F.10)", () => {
    it("аномальный паттерн даёт высокий Outfit персоны", () => {
        // Лёгкие неверно, трудные верно — ровно случай из §N.1.
        const theta = 0;
        const obs: FitObservation[] = [
            ...Array.from({ length: 10 }, (_, i) => ({ correct: 0 as 0 | 1, theta, difficulty: -2 - i * 0.1 })),
            ...Array.from({ length: 10 }, (_, i) => ({ correct: 1 as 0 | 1, theta, difficulty: 2 + i * 0.1 })),
        ];
        const report = personFitReport(obs);
        expect(report.outfit!).toBeGreaterThan(MISFIT_HIGH);
        expect(report.flags).toContain("MISFIT_UNDERFIT");
    });

    it("обычная работа не помечается", () => {
        const rand = mulberry32(555);
        const theta = 0.3;
        const obs: FitObservation[] = Array.from({ length: 40 }, (_, i) => {
            const difficulty = -2 + (4 * i) / 39;
            return { correct: (rand() < p(theta, difficulty) ? 1 : 0) as 0 | 1, theta, difficulty };
        });
        expect(personFitReport(obs).flags).toEqual([]);
    });

    it("point-measure для персоны не придумывается (§F.11 про задание)", () => {
        expect(personFitReport(byModel(0, 50, 2)).pointMeasure).toBeNull();
    });
});
