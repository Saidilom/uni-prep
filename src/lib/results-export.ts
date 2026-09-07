// Выгрузка результатов мока в файл, который открывается в Excel.
//
// Без библиотеки намеренно. Настоящий .xlsx требует внешнего пакета, а оба
// подходящих оказались негодными: у `xlsx` с npm две уязвимости без
// исправления (пакет заброшен на 0.18.5), у `exceljs` — 23 МБ и замечание
// через зависимость. Ради одной кнопки экспорта это неоправданная цена.
//
// CSV открывается Excel напрямую, если соблюсти две вещи, и обе тут учтены:
//
//   1. BOM в начале — иначе Excel читает файл как ANSI, и узбекские и русские
//      буквы превращаются в кракозябры.
//   2. Строка `sep=;` первой — Excel берёт разделитель из неё. Без этого файл
//      разбирается по разделителю из настроек Windows, и на части машин все
//      данные слипаются в одну колонку.
//
// Колонок намеренно четыре. Сначала выгружались ещё ID ученика, число верных,
// процент, дата и статус — владелец попросил оставить только то, ради чего
// таблицу открывают: кто, сколько баллов, какой уровень.

import { formatScore } from "./certificate-scale";

export type ExportRow = {
    name: string;
    levelScore: number | null;
    gradeLevel: string | null;
};

export type ExportLabels = {
    number: string;
    student: string;
    score: string;
    level: string;
};

const DELIMITER = ";";

// Экранирование по RFC 4180: кавычка удваивается, а поле берётся в кавычки,
// если внутри есть разделитель, кавычка или перевод строки. Имена приходят из
// профиля, и точка с запятой в фамилии не должна ломать таблицу.
function escapeCell(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return "";
    const text = String(value);
    if (text === "") return "";
    if (text.includes(DELIMITER) || text.includes('"') || text.includes("\n") || text.includes("\r")) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

export function buildResultsCsv(rows: ExportRow[], labels: ExportLabels): string {
    const header = [labels.number, labels.student, labels.score, labels.level];
    // Балл через formatScore: с запятой, а не с точкой. Разделитель колонок
    // здесь `;`, поэтому запятая внутри числа таблицу не рвёт, зато Excel с
    // русской локалью читает «67,8» как ЧИСЛО — с точкой он счёл бы это текстом,
    // и среднее по колонке в таблице посчитать бы не вышло.
    const body = rows.map((row, index) => [
        index + 1,
        row.name,
        formatScore(row.levelScore),
        row.gradeLevel ?? "",
    ]);

    const lines = [header, ...body].map((cells) => cells.map(escapeCell).join(DELIMITER));
    // \r\n, а не \n: Excel на Windows иначе показывает файл одной строкой.
    return `﻿sep=${DELIMITER}\r\n${lines.join("\r\n")}\r\n`;
}

// Имя файла из названия теста: убираем то, что файловые системы не принимают,
// и подрезаем длину — названия моков бывают в целую строку.
export function exportFileName(title: string, date = ""): string {
    const safe = title
        .replace(/[\\/:*?"<>|]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60) || "results";
    return `${safe}${date ? ` ${date}` : ""}.csv`;
}
