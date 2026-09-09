import { describe, it, expect } from "vitest";
import { foldSubjectBreakdown, SubjectBreakdownRow } from "./branch-subject-fold";

const row = (p: Partial<SubjectBreakdownRow> & { subjectId: string }): SubjectBreakdownRow => ({
    oylikAvg: null, oylikAttempts: 0, overallAvg: null, overallAttempts: 0, ...p,
});

describe("свёртка родного языка", () => {
    it("'russian', 'uzbek' и 'native' складываются в один предмет", () => {
        const out = foldSubjectBreakdown([
            row({ subjectId: "russian", overallAvg: 40, overallAttempts: 10 }),
            row({ subjectId: "uzbek", overallAvg: 50, overallAttempts: 10 }),
            row({ subjectId: "native", overallAvg: 60, overallAttempts: 20 }),
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].core).toBe("native");
        expect(out[0].overallAttempts).toBe(40);
    });

    it("складывается ВЗВЕШЕННО, а не как среднее из средних", () => {
        // Ловушка, ради которой модуль и вынесен: 40 на десяти сдачах и 60 на
        // сорока дают 56, а не 50.
        const out = foldSubjectBreakdown([
            row({ subjectId: "russian", overallAvg: 40, overallAttempts: 10 }),
            row({ subjectId: "native", overallAvg: 60, overallAttempts: 40 }),
        ]);
        expect(out[0].overallAvg!).toBeCloseTo(56, 12);
        expect(out[0].overallAvg!).not.toBeCloseTo(50, 1);
    });

    it("месячный балл сворачивается той же взвешенной суммой", () => {
        const out = foldSubjectBreakdown([
            row({ subjectId: "uzbek", oylikAvg: 30, oylikAttempts: 2, overallAvg: 30, overallAttempts: 2 }),
            row({ subjectId: "native", oylikAvg: 60, oylikAttempts: 6, overallAvg: 60, overallAttempts: 6 }),
        ]);
        expect(out[0].oylikAvg!).toBeCloseTo(52.5, 12);
        expect(out[0].oylikAttempts).toBe(8);
    });
});

describe("отсутствие данных не путается с нулём", () => {
    it("предмет без месячных сдач даёт null, а не 0", () => {
        const out = foldSubjectBreakdown([
            row({ subjectId: "math", overallAvg: 30, overallAttempts: 5 }),
        ]);
        expect(out[0].oylikAvg).toBeNull();
        expect(out[0].oylikAttempts).toBe(0);
        expect(out[0].overallAvg).toBe(30);
    });

    it("строка с нулём попыток не тянет свёрнутый балл вниз", () => {
        // Если бы её среднее прибавилось, балл упал бы с 60 до 30.
        const out = foldSubjectBreakdown([
            row({ subjectId: "native", overallAvg: 60, overallAttempts: 10 }),
            row({ subjectId: "russian", overallAvg: 0, overallAttempts: 0 }),
        ]);
        expect(out[0].overallAvg!).toBeCloseTo(60, 12);
        expect(out[0].overallAttempts).toBe(10);
    });

    it("нечисловое среднее игнорируется, а не превращает балл в NaN", () => {
        const out = foldSubjectBreakdown([
            row({ subjectId: "math", overallAvg: Number.NaN, overallAttempts: 5 }),
            row({ subjectId: "math", overallAvg: 40, overallAttempts: 5 }),
        ]);
        expect(out[0].overallAvg!).toBeCloseTo(40, 12);
        expect(out[0].overallAttempts).toBe(5);
    });

    it("пустой вход даёт пустой список", () => {
        expect(foldSubjectBreakdown([])).toEqual([]);
    });
});

describe("предметы вне списка не теряются", () => {
    it("незнакомый subject_id остаётся своей строкой", () => {
        const out = foldSubjectBreakdown([
            row({ subjectId: "geography", overallAvg: 55, overallAttempts: 3 }),
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].key).toBe("geography");
        expect(out[0].core).toBeNull();
    });

    it("не сливается с родным языком", () => {
        const out = foldSubjectBreakdown([
            row({ subjectId: "it", overallAvg: 55, overallAttempts: 3 }),
            row({ subjectId: "uzbek", overallAvg: 20, overallAttempts: 3 }),
        ]);
        expect(out.map((b) => b.key).sort()).toEqual(["it", "native"]);
    });
});

describe("порядок — слабый предмет сверху", () => {
    it("сортирует по возрастанию месячного балла", () => {
        const out = foldSubjectBreakdown([
            row({ subjectId: "math", oylikAvg: 60, oylikAttempts: 5, overallAvg: 60, overallAttempts: 5 }),
            row({ subjectId: "physics", oylikAvg: 20, oylikAttempts: 5, overallAvg: 20, overallAttempts: 5 }),
            row({ subjectId: "history", oylikAvg: 40, oylikAttempts: 5, overallAvg: 40, overallAttempts: 5 }),
        ]);
        expect(out.map((b) => b.key)).toEqual(["physics", "history", "math"]);
    });

    it("предметы без месячных сдач уходят вниз", () => {
        const out = foldSubjectBreakdown([
            row({ subjectId: "math", overallAvg: 70, overallAttempts: 5 }),
            row({ subjectId: "physics", oylikAvg: 65, oylikAttempts: 5, overallAvg: 65, overallAttempts: 5 }),
        ]);
        expect(out.map((b) => b.key)).toEqual(["physics", "math"]);
    });

    it("среди них порядок по числу сдач, а не случайный", () => {
        const out = foldSubjectBreakdown([
            row({ subjectId: "math", overallAvg: 70, overallAttempts: 2 }),
            row({ subjectId: "physics", overallAvg: 70, overallAttempts: 9 }),
        ]);
        expect(out.map((b) => b.key)).toEqual(["physics", "math"]);
    });
});
