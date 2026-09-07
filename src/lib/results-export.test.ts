import { describe, it, expect } from "vitest";
import { buildResultsSheet, exportFileName, RESULTS_COLUMN_WIDTHS, ExportRow, ExportLabels } from "./results-export";

const labels: ExportLabels = {
    number: "№", student: "Ученик", score: "Балл", level: "Уровень",
};

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
    name: "Lola Xurramova", levelScore: 100, gradeLevel: "A+", ...over,
});

// Ячейка в формате write-excel-file. Тип объявлен здесь, а не берётся из
// пакета: в модуле он импортирован только как тип и в рантайм не попадает.
type Cell = { value?: unknown; type?: unknown; format?: string; fontWeight?: string } | null;
const cells = (sheet: unknown[][], rowIndex: number) => sheet[rowIndex] as Cell[];

describe("buildResultsSheet", () => {
    it("ровно четыре колонки: номер, ФИО, балл, уровень", () => {
        const header = cells(buildResultsSheet([], labels), 0);
        expect(header.map((c) => c?.value)).toEqual(["№", "Ученик", "Балл", "Уровень"]);
    });

    it("шапка выделена жирным", () => {
        // Иначе на 54 строках шапка теряется среди данных.
        for (const cell of cells(buildResultsSheet([row()], labels), 0)) {
            expect(cell?.fontWeight).toBe("bold");
        }
    });

    it("строка ученика выглядит ровно так", () => {
        const first = cells(buildResultsSheet([row()], labels), 1);
        expect(first.map((c) => c?.value)).toEqual([1, "Lola Xurramova", 100, "A+"]);
    });

    // То, ради чего и переходили на .xlsx: у CSV балл был текстом, и его
    // десятичный разделитель конфликтовал с разделителем колонок.
    it("балл лежит ЧИСЛОМ, а не строкой", () => {
        const scoreCell = cells(buildResultsSheet([row({ levelScore: 99.8 })], labels), 1)[2];
        expect(scoreCell?.value).toBe(99.8);
        expect(typeof scoreCell?.value).toBe("number");
        expect(scoreCell?.type).toBe(Number);
    });

    it("балл показывается с одним знаком после запятой", () => {
        // Иначе в одной колонке оказались бы «99» и «99,8» вперемешку. Сам
        // символ разделителя подставит Excel по своей локали.
        const scoreCell = cells(buildResultsSheet([row({ levelScore: 100 })], labels), 1)[2];
        expect(scoreCell?.format).toBe("0.0");
    });

    it("номер строки — тоже число, чтобы сортировка не была текстовой", () => {
        const sheet = buildResultsSheet([row(), row(), row()], labels);
        expect([1, 2, 3].map((n) => cells(sheet, n)[0]?.value)).toEqual([1, 2, 3]);
        expect(cells(sheet, 1)[0]?.type).toBe(Number);
    });

    it("непосчитанный балл — пустая ячейка, а не ноль", () => {
        // Ноль читался бы как настоящий результат ученика.
        const line = cells(buildResultsSheet([row({ levelScore: null, gradeLevel: null })], labels), 1);
        expect(line[2]).toBeNull();
        expect(line[3]?.value).toBe("");
    });

    it("не выгружает ID ученика и прочее лишнее", () => {
        // Владелец попросил убрать ID и оставить только суть — если колонки
        // вернутся, тест это поймает.
        const sheet = buildResultsSheet([row()], labels);
        expect(JSON.stringify(sheet)).not.toContain("STU-");
        for (const line of sheet) expect(line).toHaveLength(4);
    });

    it("запятая и кавычки в фамилии больше ничего не значат", () => {
        // В CSV из-за них строка разъезжалась и требовала экранирования. В
        // .xlsx имя — просто значение ячейки.
        const nameCell = cells(buildResultsSheet([row({ name: 'Иванов, "Ваня"' })], labels), 1)[1];
        expect(nameCell?.value).toBe('Иванов, "Ваня"');
    });

    it("пустой список даёт лист с одной шапкой", () => {
        expect(buildResultsSheet([], labels)).toHaveLength(1);
    });

    it("ширины колонок заданы на все четыре", () => {
        // Узбекские ФИО легко занимают 30+ знаков, и по умолчанию колонка
        // обрезала бы имя.
        expect(RESULTS_COLUMN_WIDTHS).toHaveLength(4);
        for (const width of RESULTS_COLUMN_WIDTHS) expect(width).toBeGreaterThan(0);
    });
});

describe("exportFileName", () => {
    it("даёт расширение .xlsx", () => {
        expect(exportFileName("Mock")).toBe("Mock.xlsx");
    });

    it("убирает символы, которых не бывает в именах файлов", () => {
        expect(exportFileName('Ona tili: 7/9 "milliy"')).toBe("Ona tili 7 9 milliy.xlsx");
    });

    it("подрезает слишком длинное название", () => {
        expect(exportFileName("A".repeat(200)).length).toBeLessThanOrEqual(64 + 5);
    });

    it("добавляет дату, когда она есть", () => {
        expect(exportFileName("Mock", "2026-09-06")).toBe("Mock 2026-09-06.xlsx");
    });

    it("не оставляет файл без имени", () => {
        expect(exportFileName("///")).toBe("results.xlsx");
    });
});
