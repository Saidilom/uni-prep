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

    it("не объявляет sep= — Excel всё равно его игнорировал", () => {
        // Владелец увидел «sep=;» отдельной строкой прямо в таблице: его Excel
        // директиву не понял и вывел как текст. Обычный CSV читается без неё.
        expect(buildResultsCsv([row()], labels)).not.toContain("sep=");
    });

    it("переносы строк в стиле Windows", () => {
        const csv = buildResultsCsv([row()], labels);
        expect(csv).toContain("\r\n");
        expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2); // шапка + строка
    });

    it("ровно четыре колонки: номер, ФИО, балл, уровень", () => {
        // BOM теперь стоит на строке шапки — раньше его забирала строка `sep=`.
        const header = buildResultsCsv([], labels).replace("﻿", "").split("\r\n")[0];
        expect(header).toBe("№,Ученик,Балл,Уровень");
    });

    it("не выгружает ID ученика и прочее лишнее", () => {
        // Владелец попросил убрать ID и оставить только суть — если колонки
        // вернутся, тест это поймает.
        const csv = buildResultsCsv([row()], labels);
        expect(csv).not.toContain("STU-");
        expect(csv.split("\r\n")[0].split(",")).toHaveLength(4);
    });

    it("строка ученика выглядит ровно так", () => {
        expect(buildResultsCsv([row()], labels).split("\r\n")[1]).toBe("1,Lola Xurramova,100.0,A+");
    });

    it("нумерует строки подряд", () => {
        const lines = buildResultsCsv([row(), row(), row()], labels).split("\r\n");
        expect(lines[1].startsWith("1,")).toBe(true);
        expect(lines[2].startsWith("2,")).toBe(true);
        expect(lines[3].startsWith("3,")).toBe(true);
    });

    it("запятая в фамилии не ломает таблицу", () => {
        const line = buildResultsCsv([row({ name: 'Иванов, "Ваня"' })], labels).split("\r\n")[1];
        expect(line).toBe('1,"Иванов, ""Ваня""",100.0,A+');
    });

    it("непосчитанный балл остаётся пустым, а не нулём", () => {
        // Ноль читался бы как настоящий результат ученика.
        expect(buildResultsCsv([row({ levelScore: null, gradeLevel: null })], labels).split("\r\n")[1])
            .toBe("1,Lola Xurramova,,");
    });

    // Тот самый баг, из-за которого таблица разъезжалась: балл «99,8» с
    // запятой Excel считал за две колонки, и строка «1;Lola Xurramova;99,8;A+»
    // распадалась на «1;Lola Xurramova;99» и «8;A+».
    it("балл пишется с точкой, а не с запятой — иначе колонки разъезжаются", () => {
        const line = buildResultsCsv([row({ levelScore: 99.8 })], labels).split("\r\n")[1];
        expect(line).toBe("1,Lola Xurramova,99.8,A+");
        expect(line.split(",")).toHaveLength(4);
    });

    it("каждая строка даёт ровно четыре ячейки", () => {
        // Прямая проверка того, на что жаловался владелец: сколько бы ни было
        // дробных баллов, колонок остаётся четыре.
        const csv = buildResultsCsv(
            [row({ levelScore: 99.8 }), row({ levelScore: 86.4 }), row({ levelScore: 68.9 })],
            labels,
        );
        for (const line of csv.replace("﻿", "").trim().split("\r\n")) {
            expect(line.split(",")).toHaveLength(4);
        }
    });

    it("пустой список даёт файл с одной шапкой", () => {
        expect(buildResultsCsv([], labels).split("\r\n").filter(Boolean)).toHaveLength(1);
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
