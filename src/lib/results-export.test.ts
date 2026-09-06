import { describe, it, expect } from "vitest";
import { buildResultsCsv, exportFileName, ExportRow, ExportLabels } from "./results-export";

const labels: ExportLabels = {
    number: "№", student: "Ученик", studentId: "ID", correct: "Верных",
    ofQuestions: "Всего вопросов", accuracy: "Процент", score: "Балл",
    scoreMax: "Максимум", level: "Уровень", completedAt: "Сдал", status: "Статус",
    statusDone: "Проверено", statusPending: "Ждёт проверки", statusNotTaken: "Не сдавал",
};

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
    name: "Muslima Orifiddinova", shortId: "STU-A1B2C3",
    correctAnswers: 14, totalQuestions: 50, accuracy: 28,
    levelScore: 52, levelScoreMax: 100, gradeLevel: "C+",
    completedAt: "2026-09-06T07:41:03.512+00:00", pendingReviewCount: 0,
    ...over,
});

describe("buildResultsCsv", () => {
    it("начинается с BOM — иначе Excel покажет кракозябры", () => {
        // Без BOM Excel читает файл как ANSI, и «Орифиддинова» превращается в
        // мусор. Это первое, на что жалуются при выгрузке.
        expect(buildResultsCsv([row()], labels).charCodeAt(0)).toBe(0xfeff);
    });

    it("объявляет разделитель, иначе всё слипается в одну колонку", () => {
        // Excel берёт разделитель из этой строки, а не из настроек Windows.
        expect(buildResultsCsv([row()], labels)).toContain("sep=;");
    });

    it("переносы строк в стиле Windows", () => {
        const csv = buildResultsCsv([row()], labels);
        expect(csv).toContain("\r\n");
        expect(csv.split("\r\n").filter(Boolean)).toHaveLength(3); // sep + шапка + строка
    });

    it("выводит все нужные колонки в шапке", () => {
        const header = buildResultsCsv([], labels).split("\r\n")[1];
        for (const l of ["№", "Ученик", "ID", "Верных", "Процент", "Балл", "Уровень", "Статус"]) {
            expect(header).toContain(l);
        }
    });

    it("данные ученика попадают целиком", () => {
        const line = buildResultsCsv([row()], labels).split("\r\n")[2];
        expect(line).toBe("1;Muslima Orifiddinova;STU-A1B2C3;14;50;28;52;100;C+;2026-09-06 07:41;Проверено");
    });

    it("дата пишется так, чтобы Excel не перепутал день с месяцем", () => {
        // «06.09.2026» на американской раскладке читается как 9 июня.
        const line = buildResultsCsv([row()], labels).split("\r\n")[2];
        expect(line).toContain("2026-09-06 07:41");
    });

    it("нумерует строки подряд", () => {
        const csv = buildResultsCsv([row(), row(), row()], labels);
        const lines = csv.split("\r\n");
        expect(lines[2].startsWith("1;")).toBe(true);
        expect(lines[3].startsWith("2;")).toBe(true);
        expect(lines[4].startsWith("3;")).toBe(true);
    });

    it("точка с запятой в фамилии не ломает таблицу", () => {
        const line = buildResultsCsv([row({ name: 'Иванов; "Ваня"' })], labels).split("\r\n")[2];
        expect(line).toContain('"Иванов; ""Ваня"""');
        // Колонок должно остаться столько же, сколько в шапке.
        const header = buildResultsCsv([], labels).split("\r\n")[1];
        expect(line.split(";").length).toBeGreaterThanOrEqual(header.split(";").length);
    });

    it("различает три состояния работы", () => {
        const get = (r: ExportRow) => buildResultsCsv([r], labels).split("\r\n")[2].split(";").pop();
        expect(get(row())).toBe("Проверено");
        expect(get(row({ pendingReviewCount: 1 }))).toBe("Ждёт проверки");
        expect(get(row({ completedAt: null }))).toBe("Не сдавал");
    });

    it("непосчитанный балл остаётся пустым, а не нулём", () => {
        // Ноль читался бы как настоящий результат ученика.
        const line = buildResultsCsv([row({ levelScore: null, gradeLevel: null })], labels).split("\r\n")[2];
        expect(line).toBe("1;Muslima Orifiddinova;STU-A1B2C3;14;50;28;;100;;2026-09-06 07:41;Проверено");
    });

    it("пустой список даёт файл с одной шапкой", () => {
        expect(buildResultsCsv([], labels).split("\r\n").filter(Boolean)).toHaveLength(2);
    });
});

describe("exportFileName", () => {
    it("убирает символы, которых не бывает в именах файлов", () => {
        expect(exportFileName('Ona tili: 7/9 "milliy"')).toBe("Ona tili 7 9 milliy.csv");
    });

    it("подрезает слишком длинное название", () => {
        expect(exportFileName("A".repeat(200)).length).toBeLessThanOrEqual(64 + 4);
    });

    it("добавляет дату, когда она есть", () => {
        expect(exportFileName("Mock", "2026-09-06")).toBe("Mock 2026-09-06.csv");
    });

    it("не оставляет файл без имени", () => {
        expect(exportFileName("///")).toBe("results.csv");
    });
});
