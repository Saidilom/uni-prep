import { describe, it, expect } from "vitest";
import { formatCorrectAnswer, formatStudentAnswer } from "./answer-display";

describe("formatCorrectAnswer", () => {
    // Формы, реально лежащие в боевой базе (мок ab6ae85f…).
    it("выбор варианта — только буква", () => {
        expect(formatCorrectAnswer('{"values": ["a"], "accepted": []}')).toBe("a");
        expect(formatCorrectAnswer('{"values": ["f"], "accepted": []}')).toBe("f");
    });

    it("короткий ответ — само слово", () => {
        expect(formatCorrectAnswer('{"values": [], "accepted": ["mensirar"]}')).toBe("mensirar");
        expect(formatCorrectAnswer('{"values": [], "accepted": ["1-3-2-4-5-6"]}')).toBe("1-3-2-4-5-6");
    });

    it("несколько равноправных форм — через «/»", () => {
        // Именно «или», а не перечисление: любая форма засчитывается.
        expect(formatCorrectAnswer('{"values": [], "accepted": ["nomard", "nomard kimsalar"]}')).toBe("nomard / nomard kimsalar");
        expect(formatCorrectAnswer('{"values": [], "accepted": [": > –", ": > -", ":>-", ":>–"]}')).toBe(": > – / : > - / :>- / :>–");
    });

    it("эссе — пусто, а не «{}»", () => {
        // Правильного ответа не существует, работу оценивают по критерию.
        expect(formatCorrectAnswer('{"values": [], "accepted": []}')).toBe("");
    });

    it("несколько выбранных вариантов — через запятую", () => {
        expect(formatCorrectAnswer('{"values": ["a", "c"], "accepted": []}')).toBe("a, c");
    });

    it("готовую строку не трогает", () => {
        // Старые тесты хранили ключ обычной строкой.
        expect(formatCorrectAnswer("b")).toBe("b");
        expect(formatCorrectAnswer("to‘g‘ri javob")).toBe("to‘g‘ri javob");
    });

    it("битый JSON отдаёт как есть, а не роняет экран", () => {
        expect(formatCorrectAnswer('{"values": [')).toBe('{"values": [');
    });

    it("пустое значение — пустая строка", () => {
        expect(formatCorrectAnswer(null)).toBe("");
        expect(formatCorrectAnswer(undefined)).toBe("");
        expect(formatCorrectAnswer("")).toBe("");
    });
});

describe("formatStudentAnswer", () => {
    it("обычный ответ не трогает", () => {
        expect(formatStudentAnswer("c")).toBe("c");
    });

    it("строку «null» считает отсутствием ответа", () => {
        // На экране это выводилось как ответ ученика «null».
        expect(formatStudentAnswer("null")).toBe("");
        expect(formatStudentAnswer(null)).toBe("");
        expect(formatStudentAnswer("undefined")).toBe("");
        expect(formatStudentAnswer("   ")).toBe("");
    });

    it("вопрос на соответствие — пары «пункт → вариант»", () => {
        expect(formatStudentAnswer('{"1": "a", "2": "b"}')).toBe("1 → a, 2 → b");
    });

    it("незаполненные пары в соответствии пропускает", () => {
        expect(formatStudentAnswer('{"1": "a", "2": null, "3": ""}')).toBe("1 → a");
    });

    it("массив — через запятую", () => {
        expect(formatStudentAnswer('["a", "c"]')).toBe("a, c");
    });
});
