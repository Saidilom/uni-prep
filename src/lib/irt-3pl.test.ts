import { describe, it, expect } from "vitest";
import {
    probability3pl, probabilityDerivative3pl, itemInformation3pl, testInformation3pl,
    standardError3pl, estimateTheta3pl, SCALING_D, type Item3pl, type Response3pl,
} from "./irt-3pl";
import { calibrate3pl, type CalibrationItemInput } from "./irt-3pl-calibration";

/** Тот же предел шкалы, что зашит в irt-3pl.ts. */
const THETA_SCALE_BOUND = 8;
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

    it("балл ниже суммы угадываний помечается, но оценка остаётся конечной", () => {
        // Особенность 3PL против Раша: ниже Σc правдоподобие монотонно, и
        // максимума у НЕГО нет. У апостериорной плотности он есть всегда —
        // это и есть причина, по которой θ оценивается с априорным
        // распределением, а не голым максимумом правдоподобия.
        const responses: Response3pl[] = items.map((item) => ({ correct: 0 as 0 | 1, item }));
        const result = estimateTheta3pl(responses);
        expect(result.status).toBe("EXTREME_SCORE");
        expect(Number.isFinite(result.theta)).toBe(true);
        // Главное: не граница шкалы. Прежняя реализация возвращала ровно −8, и
        // это число уходило в статистику потока как настоящая способность.
        expect(Math.abs(result.theta)).toBeLessThan(THETA_SCALE_BOUND);
    });

    it("не отдаёт границу шкалы за оценку у работ около уровня угадывания", () => {
        // Регрессия боевого случая: Mock Matematika, 36 работ, 55 заданий,
        // Σc = 7,51. Девять работ из тридцати шести упирались в θ = −8 —
        // и ученик с 0 верных получал тот же балл, что ученик с 11 верными.
        const guessy: Item3pl[] = Array.from({ length: 55 }, (_, i) => ({
            a: 0.5 + (i % 7) * 0.15,
            b: -0.7 + i * 0.06,
            c: i % 4 === 0 ? 0 : 0.25,
        }));
        const random = mulberry32(2026);
        // Ученики около и ниже уровня угадывания — те самые, на ком старая
        // оценка расходилась. По многу на каждый уровень: у одной работы
        // разброс одной случайной выборки больше, чем шаг между уровнями, и
        // требовать порядок от единичных оценок было бы требованием к удаче,
        // а не к модели.
        const thetas = [-3, -2.25, -1.5];
        const perLevel = 40;
        const byLevel = thetas.map((trueTheta) =>
            Array.from({ length: perLevel }, () => estimateTheta3pl(
                guessy.map((item) => ({
                    correct: (random() < probability3pl(trueTheta, item) ? 1 : 0) as 0 | 1,
                    item,
                })),
            )),
        );
        const all = byLevel.flat();

        // Ни одна работа не упирается в границу шкалы — это и есть регрессия.
        for (const e of all) {
            expect(Number.isFinite(e.theta)).toBe(true);
            expect(Math.abs(e.theta)).toBeLessThan(THETA_SCALE_BOUND);
        }
        // Оценки различаются, а не слипаются в одно число: слипание и было
        // симптомом — девять работ с разным числом верных получали один балл.
        const distinct = new Set(all.map((e) => e.theta.toFixed(6)));
        expect(distinct.size).toBeGreaterThan(all.length * 0.9);
        // И средняя оценка растёт вместе со способностью.
        const means = byLevel.map((level) => level.reduce((sum, e) => sum + e.theta, 0) / level.length);
        for (let i = 1; i < means.length; i++) {
            expect(means[i]).toBeGreaterThan(means[i - 1]);
        }
    });

    it("упор в границу шкалы не считается сходимостью", () => {
        // Задания, у которых верный ответ практически невозможен ниже шкалы:
        // Ньютон будет толкать θ вниз до упора. Прежний цикл объявлял это
        // сходимостью, потому что клэмп обнулял шаг, и работа уходила в базу
        // со статусом OK.
        const steep: Item3pl[] = Array.from({ length: 20 }, () => ({ a: 1, b: -6, c: 0 }));
        const responses: Response3pl[] = steep.map((item) => ({ correct: 0 as 0 | 1, item }));
        const result = estimateTheta3pl(responses, { mean: 0, sd: 1000 });
        // Prior здесь намеренно почти плоский: без него апостериорный максимум
        // конечен и упора не возникает — проверяем именно поведение на упоре.
        expect(Math.abs(result.theta)).toBe(THETA_SCALE_BOUND);
        expect(result.status).not.toBe("OK");
    });

    it("погрешность считается по информации 3PL вместе с априорной", () => {
        const responses: Response3pl[] = items.map((item, i) => ({ correct: (i % 3 === 0 ? 1 : 0) as 0 | 1, item }));
        const result = estimateTheta3pl(responses);
        // information — свойство ТЕСТА, без вклада prior.
        expect(result.information).toBeCloseTo(testInformation3pl(result.theta, items), 12);
        // SE — апостериорная: 1/√(I + 1/σ₀²) при σ₀ = 1.
        expect(result.standardError).toBeCloseTo(1 / Math.sqrt(result.information + 1), 12);
        // И она строго меньше, чем по одному правдоподобию: априорное знание
        // тоже информация.
        expect(result.standardError).toBeLessThan(standardError3pl(result.information));
    });

    it("априорное распределение не подменяет данные на длинном тесте", () => {
        // Сдвиг к нулю от prior обязан быть тем меньше, чем больше заданий:
        // иначе априорное знание перевешивало бы работу ученика.
        const make = (count: number): Response3pl[] => {
            const random = mulberry32(11);
            return Array.from({ length: count }, (_, i) => {
                const item: Item3pl = { a: 1, b: -2 + (i % 40) * 0.1, c: 0 };
                return { correct: (random() < probability3pl(1.5, item) ? 1 : 0) as 0 | 1, item };
            });
        };
        const short = estimateTheta3pl(make(10)).theta;
        const long = estimateTheta3pl(make(120)).theta;
        expect(Math.abs(long - 1.5)).toBeLessThan(Math.abs(short - 1.5));
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

describe("поток целиком: θ, статистика потока и балл", () => {
    // Слепок боевого случая, на котором расчёт сломался: Mock Matematika,
    // 36 работ, 55 заданий, четыре варианта ответа (c около 0,25), несколько
    // заданий, которые не решил никто. Проверяется не формула, а то, во что
    // расчёт складывается ЦЕЛИКОМ — именно на этом уровне и была ошибка:
    // каждая функция по отдельности выглядела правдоподобно.
    function simulateCohort(personCount: number) {
        const random = mulberry32(4242);
        const gauss = () => {
            // Бокс-Мюллер: нужен нормальный поток, а не равномерный.
            const u = Math.max(1e-12, random());
            return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
        };
        const items: Item3pl[] = Array.from({ length: 55 }, (_, i) => ({
            a: 0.6 + (i % 6) * 0.18,
            b: -0.8 + i * 0.065,
            c: i % 5 === 0 ? 0 : 0.25,
        }));
        // Поток слабый относительно варианта — как на проде, где средняя доля
        // верных была около 22%.
        const trueThetas = Array.from({ length: personCount }, () => -0.6 + gauss());
        const responses = trueThetas.map((theta) =>
            items.map((item) => (random() < probability3pl(theta, item) ? 1 : 0) as 0 | 1),
        );
        return { items, trueThetas, responses };
    }

    const { items, trueThetas, responses } = simulateCohort(36);
    const calibration = calibrate3pl(
        items.map((_, i) => ({ responses: responses.map((row) => row[i]), optionCount: items[i].c > 0 ? 4 : null })),
    );
    const estimates = responses.map((row) =>
        estimateTheta3pl(row.map((correct, i) => ({ correct, item: calibration.items[i] }))),
    );
    const thetas = estimates.map((e) => e.theta);
    const mu = thetas.reduce((a, b) => a + b, 0) / thetas.length;
    const sigma = Math.sqrt(thetas.reduce((a, b) => a + (b - mu) ** 2, 0) / (thetas.length - 1));

    it("ни одна работа не оценена границей шкалы", () => {
        for (const e of estimates) {
            expect(Number.isFinite(e.theta)).toBe(true);
            expect(Math.abs(e.theta)).toBeLessThan(THETA_SCALE_BOUND);
        }
    });

    it("разброс потока не раздут крайними работами", () => {
        // ЭТО ГЛАВНАЯ РЕГРЕССИЯ. На проде σ выходила 3,40 вместо 0,99, потому
        // что девять работ лежали на −8. Балл считается как
        // T = 50 + 10(θ−μ)/σ, поэтому раздутая σ сжимала баллы ВСЕХ
        // остальных: лучшая работа получала 62,3 вместо 73,4 — B+ вместо A+.
        //
        // Калибровка ведёт θ к N(0,1), поэтому σ обязана быть около единицы.
        expect(sigma).toBeGreaterThan(0.5);
        expect(sigma).toBeLessThan(2);
        expect(Math.abs(mu)).toBeLessThan(1.5);
    });

    it("оценка следует за истинной способностью", () => {
        // Корреляция, а не совпадение: 55 заданий и 36 человек точности не
        // дают, но связь обязана быть сильной — иначе балл не измеряет ничего.
        const meanTrue = trueThetas.reduce((a, b) => a + b, 0) / trueThetas.length;
        let cov = 0, varTrue = 0, varEst = 0;
        for (let n = 0; n < thetas.length; n++) {
            cov += (trueThetas[n] - meanTrue) * (thetas[n] - mu);
            varTrue += (trueThetas[n] - meanTrue) ** 2;
            varEst += (thetas[n] - mu) ** 2;
        }
        expect(cov / Math.sqrt(varTrue * varEst)).toBeGreaterThan(0.8);
    });

    it("балл различает учеников по всей ширине шкалы", () => {
        // Симптом сломанного расчёта — слипание баллов. Считаем ровно так же,
        // как роут: T = 50 + 10(θ−μ)/σ, обрезанный шкалой.
        const scores = thetas.map((theta) => Math.max(0, Math.min(75, 50 + 10 * (theta - mu) / sigma)));
        const distinct = new Set(scores.map((x) => x.toFixed(2)));
        expect(distinct.size).toBeGreaterThan(scores.length * 0.9);
        // И занимает осмысленный диапазон, а не сидит в узкой полосе вокруг 50.
        expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(25);
    });

    it("погрешность балла честная, а не сотни баллов", () => {
        // На проде у прижатых к −8 работ score_se доходила до 1044 баллов на
        // 75-балльной шкале — число, которое нельзя ни показать, ни усреднить.
        for (const e of estimates) {
            const scoreSe = 10 * e.standardError / sigma;
            expect(Number.isFinite(scoreSe)).toBe(true);
            expect(scoreSe).toBeGreaterThan(0);
            expect(scoreSe).toBeLessThan(20);
        }
    });
});
