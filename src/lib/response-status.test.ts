import { describe, it, expect } from "vitest";
import { classifyResponses, responseForModel, countStates, isMissing, ResponseState } from "./response-status";

const seq = (pattern: string): Array<{ answered: boolean; correct: boolean }> =>
    // "1" верно, "0" неверно, "." не отвечено
    Array.from(pattern).map((c) => ({ answered: c !== ".", correct: c === "1" }));

describe("classifyResponses (§A.3–A.4)", () => {
    it("хвостовые пропуски это NOT_REACHED, а не неверные ответы", () => {
        expect(classifyResponses(seq("1101..."))).toEqual([
            "CORRECT", "CORRECT", "INCORRECT", "CORRECT", "NOT_REACHED", "NOT_REACHED", "NOT_REACHED",
        ]);
    });

    it("пропуск до последнего отвеченного это OMITTED", () => {
        // Ученик, ответивший на последнее задание, до серединных дошёл заведомо.
        expect(classifyResponses(seq("1..01"))).toEqual([
            "CORRECT", "OMITTED", "OMITTED", "INCORRECT", "CORRECT",
        ]);
    });

    it("различает оба вида в одной работе", () => {
        expect(classifyResponses(seq("1.0.1.."))).toEqual([
            "CORRECT", "OMITTED", "INCORRECT", "OMITTED", "CORRECT", "NOT_REACHED", "NOT_REACHED",
        ]);
    });

    it("полностью пустая работа — вся NOT_REACHED", () => {
        // Отвеченного нет, значит нет и доказательства, что человек куда-то
        // дошёл. При калибровке такая работа выпадает целиком.
        expect(classifyResponses(seq("....."))).toEqual(
            ["NOT_REACHED", "NOT_REACHED", "NOT_REACHED", "NOT_REACHED", "NOT_REACHED"],
        );
    });

    it("работа без пропусков не содержит missing-состояний", () => {
        const states = classifyResponses(seq("101101"));
        expect(states.some(isMissing)).toBe(false);
    });

    it("пустой вход даёт пустой выход, а не падение", () => {
        expect(classifyResponses([])).toEqual([]);
    });
});

describe("responseForModel — политика пропусков", () => {
    it("EXAM: пропуск не даёт баллов, то есть идёт нулём", () => {
        // Политика оценивания, а не свойство модели: ученик, не ответивший,
        // баллов за это задание не получает.
        expect(responseForModel("OMITTED", "EXAM")).toBe(0);
        expect(responseForModel("NOT_REACHED", "EXAM")).toBe(0);
    });

    it("CALIBRATION: пропуск исключается из likelihood, а не считается нулём", () => {
        // Ровно то, что требует §A.3: «не кормить их в likelihood как 0».
        expect(responseForModel("OMITTED", "CALIBRATION")).toBeNull();
        expect(responseForModel("NOT_REACHED", "CALIBRATION")).toBeNull();
    });

    it("данные ответы не зависят от политики", () => {
        for (const policy of ["EXAM", "CALIBRATION"] as const) {
            expect(responseForModel("CORRECT", policy)).toBe(1);
            expect(responseForModel("INCORRECT", policy)).toBe(0);
        }
    });
});

describe("countStates", () => {
    it("считает все четыре состояния и ничего не теряет", () => {
        const states = classifyResponses(seq("1.0.1.."));
        const counts = countStates(states);
        expect(counts).toEqual({ CORRECT: 2, INCORRECT: 1, OMITTED: 2, NOT_REACHED: 2 });
        const total = (Object.values(counts) as number[]).reduce((a, b) => a + b, 0);
        expect(total).toBe(states.length);
    });
});

// Замер с прода, зафиксированный числами: 501 из 636 пропусков — хвостовые.
// Тест сторожит, что разметка на таком профиле даёт именно то разделение, из
// которого считался этот вывод.
describe("профиль прода: хвостовых пропусков заметно больше серединных", () => {
    it("на типичной брошенной работе почти все пропуски это NOT_REACHED", () => {
        // Ученик прошёл 24 задания из 55, дальше не дошёл; внутри пропустил два.
        const pattern = "1".repeat(10) + "0.10." + "1".repeat(9) + ".".repeat(31);
        const counts = countStates(classifyResponses(seq(pattern)));
        expect(counts.NOT_REACHED).toBe(31);
        expect(counts.OMITTED).toBe(2);
        expect(counts.NOT_REACHED).toBeGreaterThan(counts.OMITTED * 5);
    });
});

// Полный набор состояний нормы — чтобы добавление пятого не прошло молча.
describe("состояния перечислены полностью", () => {
    it("каждое состояние имеет определённое поведение при обеих политиках", () => {
        const all: ResponseState[] = ["CORRECT", "INCORRECT", "OMITTED", "NOT_REACHED"];
        for (const state of all) {
            for (const policy of ["EXAM", "CALIBRATION"] as const) {
                const v = responseForModel(state, policy);
                expect(v === 0 || v === 1 || v === null).toBe(true);
            }
        }
    });
});
