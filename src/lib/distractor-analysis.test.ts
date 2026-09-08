import { describe, it, expect } from "vitest";
import {
    analyzeQuestion,
    parseSelection,
    correctOptionsFor,
    isClosedQuestion,
    DistractorResponse,
    MIN_OPTION_RESPONSES,
    MIN_QUESTION_RESPONSES,
} from "./distractor-analysis";

const KEYS = ["a", "b", "c", "d"];

/** n ответов с указанным выбором и равномерно растущей θ от lo до hi. */
function pick(option: string, thetas: number[]): DistractorResponse[] {
    return thetas.map((theta) => ({ theta, selected: [option] }));
}

describe("parseSelection — три формата из mock_answer_details", () => {
    it("одиночный выбор — просто буква", () => {
        expect(parseSelection("a")).toEqual(["a"]);
        expect(parseSelection("  c  ")).toEqual(["c"]);
    });

    it("множественный выбор — JSON-массив", () => {
        expect(parseSelection('["a","c"]')).toEqual(["a", "c"]);
        expect(parseSelection("[\"b\"]")).toEqual(["b"]);
    });

    it("неотвеченное — литерал 'null', а не NULL", () => {
        // Так его пишет submit_mock; принять его за выбор варианта нельзя.
        expect(parseSelection("null")).toEqual([]);
        expect(parseSelection(null)).toEqual([]);
        expect(parseSelection(undefined)).toEqual([]);
        expect(parseSelection("")).toEqual([]);
        expect(parseSelection("   ")).toEqual([]);
        expect(parseSelection("[]")).toEqual([]);
    });

    it("цифра не путается с JSON-числом", () => {
        // '2' разбирается как JSON-число, но выбором варианта не является.
        expect(parseSelection("2")).toEqual([]);
    });
});

describe("correctOptionsFor — answer_key главнее correct_answer", () => {
    it("берёт весь набор верных из answer_key", () => {
        // Ровно случай единственного multiple_choice на проде.
        expect(correctOptionsFor("b", { values: ["b", "d"] })).toEqual(["b", "d"]);
    });

    it("падает на correct_answer, когда answer_key пуст", () => {
        expect(correctOptionsFor("c", { values: [] })).toEqual(["c"]);
        expect(correctOptionsFor("c", null)).toEqual(["c"]);
        expect(correctOptionsFor("c", undefined)).toEqual(["c"]);
    });

    it("ключа нет вовсе — пустой список, а не выдуманный вариант", () => {
        expect(correctOptionsFor(null, null)).toEqual([]);
        expect(correctOptionsFor("  ", null)).toEqual([]);
    });
});

describe("isClosedQuestion", () => {
    it("открытое задание вариантов не имеет", () => {
        expect(isClosedQuestion([])).toBe(false);
        expect(isClosedQuestion(["a"])).toBe(false);
        expect(isClosedQuestion(["a", "b"])).toBe(true);
    });
});

describe("доли и средние", () => {
    const responses: DistractorResponse[] = [
        ...pick("a", [1.0, 1.2, 1.4, 1.6]),
        ...pick("b", [-0.5, -0.3]),
        ...pick("c", [0.1, 0.1]),
        ...pick("d", [-1.0, -1.0]),
    ];

    it("доля считается от ОТВЕТИВШИХ, а не от всех сдававших", () => {
        const withOmits = [...responses, { theta: 0.5, selected: [] }, { theta: 0.2, selected: [] }];
        const r = analyzeQuestion("q", KEYS, ["a"], withOmits);

        expect(r.respondents).toBe(10);
        expect(r.omitted).toBe(2);
        // 4 из 10 ответивших, а не 4 из 12.
        expect(r.options.find((o) => o.option === "a")!.share).toBeCloseTo(0.4, 12);
    });

    it("доли по всем вариантам дают 100% при одиночном выборе", () => {
        const r = analyzeQuestion("q", KEYS, ["a"], responses);
        const total = r.options.reduce((sum, o) => sum + o.share, 0);
        expect(total).toBeCloseTo(1, 12);
    });

    it("средняя θ считается только по выбравшим этот вариант", () => {
        const r = analyzeQuestion("q", KEYS, ["a"], responses);
        expect(r.options.find((o) => o.option === "a")!.meanTheta).toBeCloseTo(1.3, 12);
        expect(r.options.find((o) => o.option === "b")!.meanTheta).toBeCloseTo(-0.4, 12);
        expect(r.correctMeanTheta).toBeCloseTo(1.3, 12);
    });

    it("ученик без посчитанной θ считается в долю, но не в среднюю", () => {
        const r = analyzeQuestion("q", KEYS, ["a"], [
            ...pick("a", [1.0, 2.0]),
            { theta: null, selected: ["a"] },
        ]);
        const a = r.options.find((o) => o.option === "a")!;
        expect(a.count).toBe(3);
        expect(a.meanTheta).toBeCloseTo(1.5, 12);
    });
});

describe("флаг OUTPERFORMS_CORRECT — сигнал ошибки ключа", () => {
    it("срабатывает, когда дистрактор притягивает сильных", () => {
        // Ключ говорит «a», но выбравшие «c» сильнее — почти наверняка верный
        // ответ «c», а в ключе опечатка.
        const r = analyzeQuestion("q", KEYS, ["a"], [
            ...pick("a", [-0.8, -0.6, -0.5, -0.4, -0.2]),
            ...pick("c", [1.1, 1.3, 1.5, 1.7, 1.9]),
            ...pick("b", [-1.0, -0.9, -0.9, -0.7, -0.6]),
            ...pick("d", [-1.2, -1.1, -1.0, -0.9, -0.8]),
        ]);

        const c = r.options.find((o) => o.option === "c")!;
        expect(c.flags).toContain("OUTPERFORMS_CORRECT");
        // На пяти ответах оговорки о малой выборке уже нет.
        expect(c.flags).not.toContain("LOW_COUNT");
        expect(r.flags).toContain("OUTPERFORMS_CORRECT");
        // Остальные дистракторы слабее верного — их не помечаем.
        expect(r.options.find((o) => o.option === "b")!.flags).toEqual([]);
    });

    it("не срабатывает, когда задание работает как надо", () => {
        const r = analyzeQuestion("q", KEYS, ["a"], [
            ...pick("a", [1.0, 1.2, 1.4, 1.6, 1.8]),
            ...pick("b", [-0.5, -0.4, -0.3, -0.2, -0.1]),
            ...pick("c", [0.0, 0.1, 0.2, 0.3, 0.4]),
            ...pick("d", [-1.0, -0.9, -0.8, -0.7, -0.6]),
        ]);
        expect(r.flags).toEqual([]);
        expect(r.status).toBe("OK");
    });

    it("верный вариант никогда не помечается как дистрактор", () => {
        // Даже если верных два и один из них сильнее другого.
        const r = analyzeQuestion("q", KEYS, ["a", "b"], [
            ...pick("a", [-0.5, -0.4, -0.3, -0.2, -0.1]),
            ...pick("b", [1.5, 1.6, 1.7, 1.8, 1.9]),
            ...pick("c", [-1.0, -0.9, -0.8, -0.7, -0.6]),
            ...pick("d", [-1.1, -1.0, -0.9, -0.8, -0.7]),
        ]);
        expect(r.options.filter((o) => o.isCorrect).every((o) => o.flags.length === 0)).toBe(true);
        expect(r.flags).toEqual([]);
    });

    it("равенство средних не считается превышением", () => {
        const r = analyzeQuestion("q", KEYS, ["a"], [
            ...pick("a", [0.5, 0.5, 0.5, 0.5, 0.5]),
            ...pick("c", [0.5, 0.5, 0.5, 0.5, 0.5]),
            ...pick("b", [0.0, 0.0, 0.0, 0.0, 0.0]),
            ...pick("d", [0.0, 0.0, 0.0, 0.0, 0.0]),
        ]);
        expect(r.options.find((o) => o.option === "c")!.flags).toEqual([]);
    });

    it("на малой выборке флаг остаётся, но с оговоркой", () => {
        // Прятать сигнал нельзя, обещать надёжность — тоже.
        const r = analyzeQuestion("q", KEYS, ["a"], [
            ...pick("a", [-0.5, -0.4, -0.3, -0.2, -0.1, 0.0, 0.1, 0.2, 0.3]),
            ...pick("c", [2.5]),
            ...pick("b", [-1.0]),
            ...pick("d", [-1.1]),
        ]);
        const c = r.options.find((o) => o.option === "c")!;
        expect(c.count).toBeLessThan(MIN_OPTION_RESPONSES);
        expect(c.flags).toContain("OUTPERFORMS_CORRECT");
        expect(c.flags).toContain("LOW_COUNT");
    });
});

describe("флаг DEAD_DISTRACTOR", () => {
    it("помечает вариант, который не выбрал никто", () => {
        const r = analyzeQuestion("q", KEYS, ["a"], [
            ...pick("a", [1.0, 1.1, 1.2, 1.3, 1.4]),
            ...pick("b", [-0.5, -0.4, -0.3, -0.2, -0.1]),
            ...pick("c", [0.0, 0.1, 0.2, 0.3, 0.4]),
        ]);
        const d = r.options.find((o) => o.option === "d")!;
        expect(d.count).toBe(0);
        expect(d.meanTheta).toBeNull();
        expect(d.flags).toContain("DEAD_DISTRACTOR");
        // Мёртвый дистрактор не может «обгонять» — сравнивать не с чем.
        expect(d.flags).not.toContain("OUTPERFORMS_CORRECT");
    });

    it("невыбранный ВЕРНЫЙ вариант мёртвым дистрактором не считается", () => {
        // Это другая находка: задание, которое никто не решил. Мешать её с
        // мёртвым дистрактором значило бы предложить убрать верный ответ.
        const r = analyzeQuestion("q", KEYS, ["a"], [
            ...pick("b", [-0.5, -0.4, -0.3, -0.2, -0.1]),
            ...pick("c", [0.0, 0.1, 0.2, 0.3, 0.4]),
            ...pick("d", [-1.0, -0.9, -0.8, -0.7, -0.6]),
        ]);
        const a = r.options.find((o) => o.option === "a")!;
        expect(a.count).toBe(0);
        expect(a.flags).toEqual([]);
        expect(r.status).toBe("NO_CORRECT_RESPONSES");
        expect(r.correctMeanTheta).toBeNull();
    });

    it("без выбравших верный ответ дистракторы не помечаются вовсе", () => {
        // Сравнивать не с чем: любое сравнение здесь было бы выдумкой.
        const r = analyzeQuestion("q", KEYS, ["a"], [
            ...pick("b", [1.5, 1.6, 1.7, 1.8, 1.9]),
            ...pick("c", [1.0, 1.1, 1.2, 1.3, 1.4]),
            ...pick("d", [0.5, 0.6, 0.7, 0.8, 0.9]),
        ]);
        expect(r.flags).not.toContain("OUTPERFORMS_CORRECT");
    });
});

describe("статусы вместо чисел на плохих данных (§217)", () => {
    it("мало ответивших — TOO_FEW_RESPONSES", () => {
        const r = analyzeQuestion("q", KEYS, ["a"], pick("a", [1.0, 1.1, 1.2]));
        expect(r.respondents).toBeLessThan(MIN_QUESTION_RESPONSES);
        expect(r.status).toBe("TOO_FEW_RESPONSES");
    });

    it("на неизмеренном задании флагов нет вовсе", () => {
        // Иначе «вариант не выбрал никто» срабатывает там, где никто не
        // отвечал вообще. На проде это давало 60 ложных срабатываний из 61 и
        // прятало единственную настоящую находку.
        const nobody = analyzeQuestion("q", KEYS, ["a"], [
            { theta: 0.5, selected: [] }, { theta: 0.1, selected: [] },
        ]);
        expect(nobody.flags).toEqual([]);
        expect(nobody.status).toBe("TOO_FEW_RESPONSES");

        const few = analyzeQuestion("q", KEYS, ["a"], [
            ...pick("a", [-1.0, -0.9]),
            ...pick("c", [2.0, 2.1]),
        ]);
        // Дистрактор формально обгоняет верный, но на четырёх ответах это не
        // находка, а совпадение.
        expect(few.flags).toEqual([]);
        expect(few.status).toBe("TOO_FEW_RESPONSES");
    });

    it("ровно на границе MIN_QUESTION_RESPONSES флаги уже ставятся", () => {
        const thetas = Array.from({ length: MIN_QUESTION_RESPONSES - 1 }, (_, i) => -1 + i * 0.1);
        const r = analyzeQuestion("q", KEYS, ["a"], [
            ...pick("a", thetas),
            ...pick("c", [3.0]),
        ]);
        expect(r.respondents).toBe(MIN_QUESTION_RESPONSES);
        expect(r.status).toBe("OK");
        expect(r.flags).toContain("OUTPERFORMS_CORRECT");
        expect(r.options.find((o) => o.option === "d")!.flags).toContain("DEAD_DISTRACTOR");
    });

    it("никто не ответил — доли нули, а не деление на ноль", () => {
        const r = analyzeQuestion("q", KEYS, ["a"], [
            { theta: 0.5, selected: [] }, { theta: 0.1, selected: [] },
        ]);
        expect(r.respondents).toBe(0);
        expect(r.omitted).toBe(2);
        expect(r.options.every((o) => o.share === 0)).toBe(true);
        expect(r.options.every((o) => Number.isFinite(o.share))).toBe(true);
    });

    it("выбор, которого нет среди вариантов, считается отдельно и не теряется", () => {
        const r = analyzeQuestion("q", KEYS, ["a"], [
            ...pick("a", [1.0, 1.1]),
            { theta: 0.5, selected: ["z"] },
            { theta: 0.4, selected: ["e"] },
        ]);
        expect(r.unknownSelections).toBe(2);
        // В доли известных вариантов чужой выбор не попадает.
        expect(r.options.reduce((sum, o) => sum + o.count, 0)).toBe(2);
    });
});

describe("множественный выбор", () => {
    const MC = ["a", "b", "c", "d"];

    it("ученик попадает во все выбранные варианты", () => {
        const r = analyzeQuestion("q", MC, ["b", "d"], [
            { theta: 1.5, selected: ["b", "d"] },
            { theta: 1.2, selected: ["b"] },
            { theta: -0.5, selected: ["a"] },
        ]);
        expect(r.respondents).toBe(3);
        expect(r.options.find((o) => o.option === "b")!.count).toBe(2);
        expect(r.options.find((o) => o.option === "d")!.count).toBe(1);
        // Суммарная доля больше 100% — так устроен множественный выбор.
        expect(r.options.reduce((sum, o) => sum + o.share, 0)).toBeGreaterThan(1);
    });

    it("отметивший оба верных даёт один вклад в среднюю верных, а не два", () => {
        const r = analyzeQuestion("q", MC, ["b", "d"], [
            { theta: 2.0, selected: ["b", "d"] },
            { theta: 1.0, selected: ["b"] },
        ]);
        // Иначе сильный ученик весил бы вдвое: (2+2+1)/3 = 1.67 вместо 1.5.
        expect(r.correctMeanTheta).toBeCloseTo(1.5, 12);
    });
});
