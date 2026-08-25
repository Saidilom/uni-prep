// Массовый импорт вопросов в банк из JSON, который админ получает извне
// (просит обычный Claude в chat конвертировать свой PDF/Excel в этот
// формат — см. src/components/question-bank-json-import.tsx за промтом).
// Чистая функция без React/Supabase — легко тестировать отдельно.

import { SUBJECTS } from "./constants";

export type Difficulty = "easy" | "medium" | "hard";

export type ImportableRow = {
    text: string;
    options: Record<string, string>;
    correct_answer: string;
    points: number;
    subject: string | null;
    topic: string | null;
    difficulty: Difficulty;
    image_url: null;
};

export type ParsedQuestion = {
    row: ImportableRow;
    warnings: string[];
    sourceIndex: number;
};

export type InvalidQuestion = {
    sourceIndex: number;
    text: string | null;
    reasons: string[];
};

export type ImportParseResult = {
    valid: ParsedQuestion[];
    invalid: InvalidQuestion[];
    topLevelError: string | null;
};

const DIFFICULTY_MAP: Record<string, Difficulty> = {
    easy: "easy",
    medium: "medium",
    hard: "hard",
    "простой": "easy",
    "средний": "medium",
    "сложный": "hard",
};

export function normalizeCorrectAnswer(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const v = value.trim().toLowerCase();
    return v === "a" || v === "b" || v === "c" || v === "d" ? v : null;
}

export function normalizeDifficulty(value: unknown): Difficulty {
    if (typeof value === "string") {
        const mapped = DIFFICULTY_MAP[value.trim().toLowerCase()];
        if (mapped) return mapped;
    }
    return "medium";
}

export function normalizeSubject(value: unknown): string | null {
    if (typeof value !== "string" || value.trim() === "") return null;
    const v = value.trim().toLowerCase();
    const byId = SUBJECTS.find((s) => s.id.toLowerCase() === v);
    if (byId) return byId.id;
    const byName = SUBJECTS.find((s) => s.name.toLowerCase() === v);
    if (byName) return byName.id;
    return null;
}

export function parseAndValidateQuestions(input: unknown): ImportParseResult {
    if (
        typeof input !== "object" ||
        input === null ||
        !Array.isArray((input as Record<string, unknown>).questions)
    ) {
        return {
            valid: [],
            invalid: [],
            topLevelError: 'Ожидался объект вида { "questions": [...] } — массив вопросов не найден.',
        };
    }

    const questions = (input as { questions: unknown[] }).questions;
    if (questions.length === 0) {
        return { valid: [], invalid: [], topLevelError: 'Массив "questions" пуст.' };
    }

    const valid: ParsedQuestion[] = [];
    const invalid: InvalidQuestion[] = [];

    questions.forEach((raw, sourceIndex) => {
        const reasons: string[] = [];
        const q = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

        const text = typeof q.text === "string" ? q.text.trim() : "";
        if (!text) reasons.push("Отсутствует текст вопроса");

        const normalizedAnswer = normalizeCorrectAnswer(q.correctAnswer);
        if (!normalizedAnswer) reasons.push("Правильный ответ не указан или не является одним из a/b/c/d");

        const optionsRaw = typeof q.options === "object" && q.options !== null ? (q.options as Record<string, unknown>) : null;
        if (!optionsRaw) {
            reasons.push("Поле options отсутствует или не является объектом");
        } else if (normalizedAnswer) {
            const answerOption = optionsRaw[normalizedAnswer];
            if (typeof answerOption !== "string" || answerOption.trim() === "") {
                reasons.push(`Вариант ответа "${normalizedAnswer}" отсутствует или пуст`);
            }
        }

        if (reasons.length > 0) {
            invalid.push({ sourceIndex, text: text || null, reasons });
            return;
        }

        const options: Record<string, string> = {};
        for (const key of ["a", "b", "c", "d"]) {
            const v = optionsRaw![key];
            if (typeof v === "string" && v.trim() !== "") options[key] = v.trim();
        }

        const warnings: string[] = [];

        const subject = normalizeSubject(q.subject);
        if (typeof q.subject === "string" && q.subject.trim() !== "" && subject === null) {
            warnings.push(`Предмет "${q.subject}" не распознан — оставлено пустым`);
        }

        const difficulty = normalizeDifficulty(q.difficulty);
        if (typeof q.difficulty === "string" && q.difficulty.trim() !== "" && !DIFFICULTY_MAP[q.difficulty.trim().toLowerCase()]) {
            warnings.push(`Сложность "${q.difficulty}" не распознана — использовано "средний"`);
        }

        const points = Number.isInteger(q.points) && (q.points as number) > 0 ? (q.points as number) : 1;
        const topic = typeof q.topic === "string" && q.topic.trim() !== "" ? q.topic.trim() : null;

        valid.push({
            sourceIndex,
            warnings,
            row: {
                text,
                options,
                correct_answer: normalizedAnswer!,
                points,
                subject,
                topic,
                difficulty,
                image_url: null,
            },
        });
    });

    return { valid, invalid, topLevelError: null };
}
