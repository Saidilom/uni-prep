import { describe, it, expect } from "vitest";
import { oylikSubjectMatches, summarizeOylikDistribution } from "./oylik-distribution";
import { CORE_SUBJECTS, NATIVE_LANGUAGE_SUBJECT_IDS } from "./mock-import-schema";

// Эти тесты закрепляют правило раздачи из publish_oylik_set (миграция 073).
// Если оно разойдётся с SQL, интерфейс начнёт обещать одно, а раздача делать
// другое — а именно молчаливое расхождение и стоило владельцу месячного теста,
// ушедшего в ноль групп.
describe("oylikSubjectMatches", () => {
    it("совпадающий предмет — попадание", () => {
        expect(oylikSubjectMatches("history", "history")).toBe(true);
        expect(oylikSubjectMatches("math", "math")).toBe(true);
    });

    it("разные предметы — мимо", () => {
        expect(oylikSubjectMatches("history", "math")).toBe(false);
        expect(oylikSubjectMatches("english", "math")).toBe(false);
    });

    it("группа «родной язык» принимает узбекский и русский тест", () => {
        // Та самая ветка из SQL: группы заводятся с общим 'native', а тесты
        // импортируются с конкретным языком.
        for (const testSubject of NATIVE_LANGUAGE_SUBJECT_IDS) {
            expect(oylikSubjectMatches(testSubject, "native")).toBe(true);
        }
    });

    it("ветка родного языка несимметрична — как в SQL", () => {
        // Обратное направление правилом НЕ покрыто: 'native'-тест не достаётся
        // группе 'uzbek'. На практике групп с 'uzbek' не бывает (у группы
        // только CORE_SUBJECTS), но копия обязана вести себя как оригинал.
        expect(oylikSubjectMatches("native", "uzbek")).toBe(false);
        expect(oylikSubjectMatches("native", "russian")).toBe(false);
    });

    it("группа без предмета не получает ничего", () => {
        // Ровно случай с прода: у группы «тарих 6 дан 8 гача» предмет не задан,
        // и тест по истории до неё не дошёл.
        expect(oylikSubjectMatches("history", null)).toBe(false);
        expect(oylikSubjectMatches("history", undefined)).toBe(false);
    });

    it("тест без предмета не достаётся никому", () => {
        expect(oylikSubjectMatches(null, "math")).toBe(false);
        expect(oylikSubjectMatches(undefined, "math")).toBe(false);
        expect(oylikSubjectMatches(null, null)).toBe(false);
    });

    it("предмет, которого у групп быть не может, не находит НИ ОДНОЙ", () => {
        // Студия предлагает при импорте географию, IT и «другое», а группе
        // доступны только семь CORE_SUBJECTS. Такой тест не дойдёт ни до кого
        // никогда — и предупреждение в разделе «Ойлик» обязано это поймать.
        for (const orphan of ["geography", "it", "other"]) {
            for (const core of CORE_SUBJECTS) {
                expect(oylikSubjectMatches(orphan, core)).toBe(false);
            }
        }
    });
});

describe("summarizeOylikDistribution", () => {
    // Состав групп ровно с прода на момент правки.
    const classes = [
        { id: "c1", subjectId: null },          // тарих 6 дан 8 гача
        { id: "c2", subjectId: null },          // 10-3
        { id: "c3", subjectId: null },          // група 1
        { id: "c4", subjectId: null },          // группа 5
        { id: "c5", subjectId: null },          // группа ибрахим
        { id: "c6", subjectId: "math" },
        { id: "c7", subjectId: "math" },
        { id: "c8", subjectId: "math" },
        { id: "c9", subjectId: "english" },
    ];

    it("воспроизводит прод: тест по истории не получает никто", () => {
        const { matchingClassesByTest } = summarizeOylikDistribution(
            [{ id: "t1", subjectId: "history" }],
            classes,
        );
        expect(matchingClassesByTest.get("t1")).toBe(0);
    });

    it("считает группы по каждому тесту отдельно", () => {
        const { matchingClassesByTest } = summarizeOylikDistribution(
            [
                { id: "t1", subjectId: "history" },
                { id: "t2", subjectId: "math" },
                { id: "t3", subjectId: "english" },
            ],
            classes,
        );
        expect(matchingClassesByTest.get("t1")).toBe(0);
        expect(matchingClassesByTest.get("t2")).toBe(3);
        expect(matchingClassesByTest.get("t3")).toBe(1);
    });

    it("считает группы без предмета", () => {
        expect(summarizeOylikDistribution([], classes).classesWithoutSubject).toBe(5);
    });

    it("на группах с предметами предупреждать не о чем", () => {
        const fixed = classes.map((cls) => ({ ...cls, subjectId: cls.subjectId ?? "history" }));
        const { matchingClassesByTest, classesWithoutSubject } = summarizeOylikDistribution(
            [{ id: "t1", subjectId: "history" }],
            fixed,
        );
        expect(classesWithoutSubject).toBe(0);
        expect(matchingClassesByTest.get("t1")).toBe(5);
    });

    it("без групп ничего не падает", () => {
        const { matchingClassesByTest, classesWithoutSubject } = summarizeOylikDistribution(
            [{ id: "t1", subjectId: "math" }],
            [],
        );
        expect(matchingClassesByTest.get("t1")).toBe(0);
        expect(classesWithoutSubject).toBe(0);
    });
});
