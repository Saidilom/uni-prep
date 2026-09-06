import { describe, it, expect } from "vitest";
import { buildBatchEssayGradingPrompt } from "./essay-grading-prompt";

// Выбор рубрики — место, где ошибка не видна на экране: сочинение проверится,
// балл выставится, и только критерий будет чужой. Поэтому проверяем не текст
// промпта целиком, а по опорным фразам, какая рубрика в него попала.
const build = (over: Partial<Parameters<typeof buildBatchEssayGradingPrompt>[0]>) =>
    buildBatchEssayGradingPrompt({
        language: null,
        maxPoints: 24,
        taskPrompt: "Esse yozing",
        answers: [{ id: "a1", text: "javob" }],
        ...over,
    });

const isUzbek = (prompt: string) => /o'zbek|uzbek/i.test(prompt);
const isRussian = (prompt: string) => /русск|russian/i.test(prompt);

describe("выбор рубрики для сочинения", () => {
    it("узбекский предмет — узбекская рубрика, даже если язык распознан неверно", () => {
        // Ровно тот случай, ради которого правка и делалась: распознавание
        // могло проставить 'mixed', и полсотни узбекских работ ушли бы на
        // русский критерий.
        const prompt = build({ subjectId: "uzbek", language: "mixed" });
        expect(isUzbek(prompt)).toBe(true);
        expect(isRussian(prompt)).toBe(false);
    });

    it("русский предмет — русская рубрика, даже если язык распознан как uz", () => {
        const prompt = build({ subjectId: "russian", language: "uz" });
        expect(isRussian(prompt)).toBe(true);
    });

    it("без предмета остаётся прежнее поведение по языку", () => {
        expect(isUzbek(build({ subjectId: null, language: "uz" }))).toBe(true);
        expect(isRussian(build({ subjectId: null, language: "ru" }))).toBe(true);
    });

    it("английские задания различаются по максимуму, а не по предмету", () => {
        // Task 1 — 10 баллов, Task 2 — 20; у английского своя шкала и свой
        // документ, предмет тут ничего не меняет.
        const task1 = build({ subjectId: "english", maxPoints: 10 });
        const task2 = build({ subjectId: "english", maxPoints: 20 });
        expect(task1).not.toBe(task2);
        expect(isUzbek(task1)).toBe(false);
        expect(isUzbek(task2)).toBe(false);
    });

    it("все ответы пачки попадают в промпт под своими id", () => {
        // Модель обязана вернуть по записи на каждый id; потеряется ответ в
        // промпте — потеряется и балл ученика.
        const prompt = buildBatchEssayGradingPrompt({
            language: "uz",
            subjectId: "uzbek",
            maxPoints: 24,
            taskPrompt: "Esse yozing",
            answers: [
                { id: "id-one", text: "birinchi javob" },
                { id: "id-two", text: "ikkinchi javob" },
            ],
        });
        expect(prompt).toContain("id-one");
        expect(prompt).toContain("id-two");
        expect(prompt).toContain("birinchi javob");
        expect(prompt).toContain("ikkinchi javob");
    });

    it("несданная работа помечается явно, а не пустотой", () => {
        const prompt = build({ subjectId: "uzbek", answers: [{ id: "x", text: "" }] });
        expect(prompt).toMatch(/пусто/i);
    });
});
