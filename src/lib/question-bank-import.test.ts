import { describe, it, expect } from "vitest";
import { parseAndValidateQuestions, normalizeSubject, normalizeDifficulty, normalizeCorrectAnswer } from "./question-bank-import";

describe("parseAndValidateQuestions", () => {
    it("reports a top-level error for non-object input or a missing questions array", () => {
        expect(parseAndValidateQuestions(null).topLevelError).not.toBeNull();
        expect(parseAndValidateQuestions("hello").topLevelError).not.toBeNull();
        expect(parseAndValidateQuestions({}).topLevelError).not.toBeNull();
        expect(parseAndValidateQuestions({ questions: [] }).topLevelError).not.toBeNull();
    });

    it("accepts a well-formed question", () => {
        const result = parseAndValidateQuestions({
            questions: [
                {
                    text: "2+2=?",
                    options: { a: "3", b: "4", c: "5", d: "6" },
                    correctAnswer: "b",
                    points: 2,
                    subject: "math",
                    topic: "Арифметика",
                    difficulty: "easy",
                },
            ],
        });
        expect(result.topLevelError).toBeNull();
        expect(result.invalid).toHaveLength(0);
        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].row).toEqual({
            text: "2+2=?",
            options: { a: "3", b: "4", c: "5", d: "6" },
            correct_answer: "b",
            points: 2,
            subject: "math",
            topic: "Арифметика",
            difficulty: "easy",
            image_url: null,
        });
        expect(result.valid[0].warnings).toHaveLength(0);
    });

    it("rejects a question missing required fields, without blocking the rest of the batch", () => {
        const result = parseAndValidateQuestions({
            questions: [
                { text: "", options: { a: "x" }, correctAnswer: "a" },
                { text: "Valid one", options: { a: "1", b: "2" }, correctAnswer: "a" },
            ],
        });
        expect(result.invalid).toHaveLength(1);
        expect(result.invalid[0].reasons).toContain("Отсутствует текст вопроса");
        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].row.text).toBe("Valid one");
    });

    it("rejects a question whose correct-answer option is missing or empty", () => {
        const result = parseAndValidateQuestions({
            questions: [{ text: "Q", options: { a: "x", b: "" }, correctAnswer: "b" }],
        });
        expect(result.valid).toHaveLength(0);
        expect(result.invalid[0].reasons.some((r) => r.includes("b"))).toBe(true);
    });

    it("leniently maps a Russian subject name and difficulty label, with a warning", () => {
        const result = parseAndValidateQuestions({
            questions: [
                {
                    text: "Q",
                    options: { a: "1", b: "2" },
                    correctAnswer: "a",
                    subject: "Математика",
                    difficulty: "простой",
                },
            ],
        });
        expect(result.valid[0].row.subject).toBe("math");
        expect(result.valid[0].row.difficulty).toBe("easy");
        expect(result.valid[0].warnings).toHaveLength(0);
    });

    it("falls back to null subject / medium difficulty with a warning when unrecognized", () => {
        const result = parseAndValidateQuestions({
            questions: [
                { text: "Q", options: { a: "1", b: "2" }, correctAnswer: "a", subject: "Астрология", difficulty: "непонятно" },
            ],
        });
        expect(result.valid[0].row.subject).toBeNull();
        expect(result.valid[0].row.difficulty).toBe("medium");
        expect(result.valid[0].warnings.length).toBeGreaterThanOrEqual(2);
    });

    it("defaults points to 1 when missing or invalid", () => {
        const result = parseAndValidateQuestions({
            questions: [{ text: "Q", options: { a: "1", b: "2" }, correctAnswer: "a", points: -5 }],
        });
        expect(result.valid[0].row.points).toBe(1);
    });
});

describe("normalizeCorrectAnswer", () => {
    it("accepts a-d case-insensitively, rejects anything else", () => {
        expect(normalizeCorrectAnswer("B")).toBe("b");
        expect(normalizeCorrectAnswer(" c ")).toBe("c");
        expect(normalizeCorrectAnswer("e")).toBeNull();
        expect(normalizeCorrectAnswer(5)).toBeNull();
    });
});

describe("normalizeDifficulty", () => {
    it("maps known values and defaults to medium", () => {
        expect(normalizeDifficulty("hard")).toBe("hard");
        expect(normalizeDifficulty("сложный")).toBe("hard");
        expect(normalizeDifficulty("???")).toBe("medium");
    });
});

describe("normalizeSubject", () => {
    it("matches by id or Russian name, else null", () => {
        expect(normalizeSubject("math")).toBe("math");
        expect(normalizeSubject("Английский")).toBe("english");
        expect(normalizeSubject("unknown-subject")).toBeNull();
        expect(normalizeSubject("")).toBeNull();
    });
});
