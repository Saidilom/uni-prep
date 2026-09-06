import { describe, it, expect } from "vitest";
import { buildResultsCsv, exportFileName, ExportRow, ExportLabels } from "./results-export";

const labels: ExportLabels = {
    number: "№", student: "Ученик", score: "Балл", level: "Уровень",
};

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
    name: "Lola Xurramova", levelScore: 100, gradeLevel: "A+", ...over,
});

describe("buildResultsCsv", () => {
    it("начинается с BOM — иначе Excel покажет кракозябры", () => {
        // Без BOM Excel читает файл как ANSI, и «Набихўжаева» превращается в
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

    it("ровно четыре колонки: номер, ФИО, балл, уровень", () => {
        const header = buildResultsCsv([], labels).split("\r\n")[1];
        expect(header).toBe("№;Ученик;Балл;Уровень");
    });

    it("не выгружает ID ученика и прочее лишнее", () => {
        // Владелец попросил убрать ID и оставить только суть — если колонки
        // вернутся, тест это поймает.
        const csv = buildResultsCsv([row()], labels);
        expect(csv).not.toContain("STU-");
        expect(csv.split("\r\n")[1].split(";")).toHaveLength(4);
    });

    it("строка ученика выглядит ровно так", () => {
        expect(buildResultsCsv([row()], labels).split("\r\n")[2]).toBe("1;Lola Xurramova;100;A+");
    });

    it("нумерует строки подряд", () => {
        const lines = buildResultsCsv([row(), row(), row()], labels).split("\r\n");
        expect(lines[2].startsWith("1;")).toBe(true);
        expect(lines[3].startsWith("2;")).toBe(true);
        expect(lines[4].startsWith("3;")).toBe(true);
    });

    it("точка с запятой в фамилии не ломает таблицу", () => {
        const line = buildResultsCsv([row({ name: 'Иванов; "Ваня"' })], labels).split("\r\n")[2];
        expect(line).toBe('1;"Иванов; ""Ваня""";100;A+');
    });

    it("непосчитанный балл остаётся пустым, а не нулём", () => {
        // Ноль читался бы как настоящий результат ученика.
        expect(buildResultsCsv([row({ levelScore: null, gradeLevel: null })], labels).split("\r\n")[2])
            .toBe("1;Lola Xurramova;;");
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
