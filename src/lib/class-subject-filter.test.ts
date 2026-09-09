import { describe, it, expect } from "vitest";
import {
    classSubject, subjectTabs, filterBySubject, sortBySubject,
    SUBJECT_ALL, SUBJECT_NONE,
} from "./class-subject-filter";
import { CORE_SUBJECTS } from "./mock-import-schema";

const cls = (subjectId: string | null, name = "") => ({ subjectId, name });

describe("classSubject — к какому предмету относится группа", () => {
    it("обычный предмет узнаётся", () => {
        expect(classSubject("math")).toBe("math");
        expect(classSubject("english")).toBe("english");
    });

    it("исторические 'russian' и 'uzbek' — это родной язык", () => {
        // Иначе они висели бы отдельными вкладками рядом с «Родной язык».
        expect(classSubject("russian")).toBe("native");
        expect(classSubject("uzbek")).toBe("native");
        expect(classSubject("native")).toBe("native");
    });

    it("предмет вне списка и пустой — без предмета", () => {
        // 'geography' и 'it' встречаются у уже созданных тестов.
        expect(classSubject("geography")).toBeNull();
        expect(classSubject("it")).toBeNull();
        expect(classSubject(null)).toBeNull();
        expect(classSubject("")).toBeNull();
    });
});

describe("subjectTabs — какие вкладки показывать", () => {
    it("показываются ВСЕ предметы, даже пустые", () => {
        // Решение владельца: по набору «Математика 2 · Без предмета 5» не
        // видно, что предметов вообще семь.
        const tabs = subjectTabs([cls("math"), cls("math"), cls("english")]);
        expect(tabs).toHaveLength(CORE_SUBJECTS.length);
        expect(tabs.find((t) => t.value === "math")!.count).toBe(2);
        expect(tabs.find((t) => t.value === "english")!.count).toBe(1);
        expect(tabs.find((t) => t.value === "biology")!.count).toBe(0);
    });

    it("порядок как в CORE_SUBJECTS, а не по алфавиту", () => {
        // По алфавиту «Биология» встала бы перед «Математикой», и это читалось
        // бы как случайность.
        const tabs = subjectTabs([cls("english"), cls("biology"), cls("math")]);
        expect(tabs.map((t) => t.value)).toEqual([...CORE_SUBJECTS]);
    });

    it("'uzbek' и 'native' складываются в одну вкладку", () => {
        const tabs = subjectTabs([cls("uzbek"), cls("native"), cls("russian")]);
        expect(tabs.find((t) => t.value === "native")!.count).toBe(3);
        // Своей вкладки у 'uzbek' и 'russian' нет.
        expect(tabs.filter((t) => t.count > 0)).toHaveLength(1);
    });

    it("«без предмета» всегда последняя вкладка", () => {
        const tabs = subjectTabs([cls(null), cls("math"), cls("geography")]);
        expect(tabs[tabs.length - 1].value).toBe(SUBJECT_NONE);
        // geography не входит в CORE_SUBJECTS, поэтому попадает к «без предмета».
        expect(tabs.find((t) => t.value === SUBJECT_NONE)!.count).toBe(2);
    });

    it("«без предмета» не показывается, когда таких групп нет", () => {
        // Это не предмет, а остаток: вкладка «Без предмета 0» сообщала бы о
        // несуществующей категории.
        const tabs = subjectTabs([cls("math")]);
        expect(tabs.some((t) => t.value === SUBJECT_NONE)).toBe(false);
    });

    it("пустой список групп — все предметы с нулями", () => {
        const tabs = subjectTabs([]);
        expect(tabs).toHaveLength(CORE_SUBJECTS.length);
        expect(tabs.every((t) => t.count === 0)).toBe(true);
    });
});

describe("filterBySubject", () => {
    const all = [cls("math", "м1"), cls("uzbek", "родной"), cls(null, "без"), cls("math", "м2")];

    it("«все» отдаёт всё", () => {
        expect(filterBySubject(all, SUBJECT_ALL)).toHaveLength(4);
    });

    it("по предмету отбирает только его", () => {
        expect(filterBySubject(all, "math").map((c) => c.name)).toEqual(["м1", "м2"]);
    });

    it("'uzbek' попадает под фильтр «родной язык»", () => {
        expect(filterBySubject(all, "native").map((c) => c.name)).toEqual(["родной"]);
    });

    it("«без предмета» собирает и пустые, и не из списка", () => {
        const withOther = [...all, cls("geography", "гео")];
        expect(filterBySubject(withOther, SUBJECT_NONE).map((c) => c.name)).toEqual(["без", "гео"]);
    });

    it("не мутирует вход", () => {
        const input = [cls("math", "a")];
        filterBySubject(input, SUBJECT_ALL).push(cls("english", "b"));
        expect(input).toHaveLength(1);
    });
});

describe("sortBySubject — порядок при «всех предметах»", () => {
    it("группирует по предмету в порядке CORE_SUBJECTS", () => {
        const out = sortBySubject([
            cls("english", "англ"), cls("math", "мат"), cls("biology", "био"),
        ]);
        expect(out.map((c) => c.name)).toEqual(["мат", "био", "англ"]);
    });

    it("внутри предмета порядок остаётся входным", () => {
        // Стабильность важна: иначе список прыгал бы при каждой перерисовке.
        const out = sortBySubject([
            cls("math", "второй"), cls("math", "первый"), cls("math", "третий"),
        ]);
        expect(out.map((c) => c.name)).toEqual(["второй", "первый", "третий"]);
    });

    it("группы без предмета уходят в конец", () => {
        const out = sortBySubject([cls(null, "без"), cls("math", "мат")]);
        expect(out.map((c) => c.name)).toEqual(["мат", "без"]);
    });

    it("родной язык встаёт на своё место в списке, а не в конец", () => {
        const out = sortBySubject([cls(null, "без"), cls("uzbek", "родной"), cls("math", "мат")]);
        const nativeIndex = CORE_SUBJECTS.indexOf("native");
        expect(nativeIndex).toBeGreaterThan(-1);
        expect(out.map((c) => c.name)).toEqual(["мат", "родной", "без"]);
    });

    it("не мутирует вход", () => {
        const input = [cls("english", "a"), cls("math", "b")];
        sortBySubject(input);
        expect(input.map((c) => c.name)).toEqual(["a", "b"]);
    });
});
