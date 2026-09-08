import { describe, it, expect } from "vitest";
import {
    ESSAY_CRITERIA,
    ESSAY_MAX_POINTS,
    CRITERION_LEVELS,
    RUBRIC_GROUP_ORDER,
    RUBRIC_GROUP_LABEL_KEY,
    isCriterionLevel,
    sumCriterionScores,
    validateCriterionScores,
    essayPointsFromVerdict,
    CriterionScore,
} from "./essay-rubric";

const all = (score: number): CriterionScore[] =>
    ESSAY_CRITERIA.map((c) => ({ index: c.index, score }));

describe("структура критерия совпадает с документом", () => {
    it("ровно 12 критериев, пронумерованных 1..12 без пропусков", () => {
        expect(ESSAY_CRITERIA).toHaveLength(12);
        expect(ESSAY_CRITERIA.map((c) => c.index)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
    });

    it("пять уровней 2 / 1,5 / 1 / 0,5 / 0, а НЕ три", () => {
        // Ключевое расхождение с постановкой: предполагалось 0/1/2, в документе
        // пять уровней. Тест сторожит, чтобы шкалу не «упростили» обратно.
        expect(CRITERION_LEVELS).toEqual([2, 1.5, 1, 0.5, 0]);
        expect(CRITERION_LEVELS).toHaveLength(5);
        expect(isCriterionLevel(1.5)).toBe(true);
        expect(isCriterionLevel(0.5)).toBe(true);
        expect(isCriterionLevel(0.7)).toBe(false);
        expect(isCriterionLevel(3)).toBe(false);
    });

    it("максимум равен 24 — «JAMI: 24 BALL» из документа", () => {
        expect(ESSAY_CRITERIA.length * Math.max(...CRITERION_LEVELS)).toBe(ESSAY_MAX_POINTS);
        expect(sumCriterionScores(all(2))).toBe(24);
        expect(sumCriterionScores(all(0))).toBe(0);
    });

    it("каждая группа документа представлена и у каждой есть перевод", () => {
        const used = new Set(ESSAY_CRITERIA.map((c) => c.group));
        expect(Array.from(used).sort()).toEqual([...RUBRIC_GROUP_ORDER].sort());
        for (const group of RUBRIC_GROUP_ORDER) {
            expect(RUBRIC_GROUP_LABEL_KEY[group]).toBeTruthy();
        }
    });

    it("группы идут подряд, как в бумаге: 1–3, 4–6, 7–8, 9–10, 11–12", () => {
        const bounds: Record<string, number[]> = {};
        for (const c of ESSAY_CRITERIA) (bounds[c.group] ??= []).push(c.index);
        expect(bounds.TASK).toEqual([1, 2, 3]);
        expect(bounds.INTEGRITY).toEqual([4, 5, 6]);
        expect(bounds.LITERACY).toEqual([7, 8]);
        expect(bounds.STYLE).toEqual([9, 10]);
        expect(bounds.VOCABULARY).toEqual([11, 12]);
    });

    it("ключ перевода у каждого критерия свой", () => {
        const keys = ESSAY_CRITERIA.map((c) => c.labelKey);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("сумма", () => {
    it("половинки не накапливают двоичный мусор", () => {
        // Двенадцать раз по 1,5 в double дают 18.000000000000004, и этот хвост
        // утёк бы в балл ученика.
        const total = sumCriterionScores(all(1.5));
        expect(total).toBe(18);
        expect(String(total)).toBe("18");
    });

    it("смешанные оценки складываются точно", () => {
        const scores: CriterionScore[] = [
            { index: 1, score: 2 }, { index: 2, score: 1.5 }, { index: 3, score: 1 },
            { index: 4, score: 0.5 }, { index: 5, score: 0 }, { index: 6, score: 2 },
            { index: 7, score: 1.5 }, { index: 8, score: 1 }, { index: 9, score: 0.5 },
            { index: 10, score: 0 }, { index: 11, score: 2 }, { index: 12, score: 1.5 },
        ];
        expect(sumCriterionScores(scores)).toBe(13.5);
    });
});

describe("проверка набора", () => {
    it("полный корректный набор проходит и возвращает сумму", () => {
        const result = validateCriterionScores(all(2));
        expect(result).toEqual({ ok: true, total: 24 });
    });

    it("НЕполный набор отклоняется, а не досчитывается нулями", () => {
        // Пропущенный критерий — не «ноль за него», а отсутствующая оценка.
        const partial = all(2).slice(0, 11);
        const result = validateCriterionScores(partial);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toContain("12");
    });

    it("оценка вне шкалы отклоняется", () => {
        const bad = all(2).map((s, i) => (i === 3 ? { ...s, score: 1.7 } : s));
        const result = validateCriterionScores(bad);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toContain("1.7");
    });

    it("дубликат критерия отклоняется", () => {
        const dup = [...all(2), { index: 5, score: 1 }];
        const result = validateCriterionScores(dup);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toContain("дважды");
    });
});

describe("особые случаи из документа", () => {
    it("не на тему / короче 100 слов / списано — ровно 2 балла", () => {
        // «Esse quyidagi hollarda tekshirilmaydi va 2 ball bilan baholanadi».
        for (const reason of ["OFF_TOPIC", "TOO_SHORT", "PLAGIARISM"] as const) {
            expect(essayPointsFromVerdict({ kind: "NOT_CHECKED", reason })).toBe(2);
        }
    });

    it("не написана — ноль", () => {
        expect(essayPointsFromVerdict({ kind: "NOT_WRITTEN" })).toBe(0);
    });

    it("обычная работа — сумма по критериям", () => {
        expect(essayPointsFromVerdict({ kind: "SCORED", scores: all(1) })).toBe(12);
    });

    it("двойка «не на тему» отличима от двойки, набранной по критериям", () => {
        // Обе дают 2 балла, но это разные вещи: одна — отказ от проверки,
        // другая — результат оценивания. В PCM их смешивать нельзя.
        const notChecked = essayPointsFromVerdict({ kind: "NOT_CHECKED", reason: "OFF_TOPIC" });
        const scored = essayPointsFromVerdict({
            kind: "SCORED",
            scores: all(0).map((s, i) => (i === 0 ? { ...s, score: 2 } : s)),
        });
        expect(notChecked).toBe(scored);
        // Различает их именно вид вердикта, а не число.
        expect({ kind: "NOT_CHECKED" }).not.toEqual({ kind: "SCORED" });
    });
});
