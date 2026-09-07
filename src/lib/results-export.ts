// Выгрузка результатов мока в файл, который открывается в Excel.
//
// Без библиотеки намеренно. Настоящий .xlsx требует внешнего пакета, а оба
// подходящих оказались негодными: у `xlsx` с npm две уязвимости без
// исправления (пакет заброшен на 0.18.5), у `exceljs` — 23 МБ и замечание
// через зависимость. Ради одной кнопки экспорта это неоправданная цена.
//
// Формат — обычный CSV по RFC 4180: разделитель запятая, десятичная точка,
// BOM в начале. BOM обязателен, иначе Excel читает файл как ANSI и узбекские с
// русскими буквами превращаются в кракозябры.
//
// Раньше здесь стояла точка с запятой плюс строка `sep=;` первой, а балл
// печатался с запятой («67,8») — в расчёте на Excel с русской локалью, который
// читает запятую как десятичный разделитель. На деле у владельца Excel строку
// `sep=;` проигнорировал (она легла в таблицу как текст) и поделил строки по
// ЗАПЯТОЙ — из-за чего «1;Lola Xurramova;99,8;A+» разорвалось на две ячейки:
// «1;Lola Xurramova;99» и «8;A+». Поэтому никаких договорённостей с локалью:
// запятая-разделитель и точка в дробной части — это читает и Excel, и Numbers,
// и Google Sheets, и любой парсер.
//
// Колонок намеренно четыре. Сначала выгружались ещё ID ученика, число верных,
// процент, дата и статус — владелец попросил оставить только то, ради чего
// таблицу открывают: кто, сколько баллов, какой уровень.

import { SCORE_DECIMALS } from "./certificate-scale";

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

const DELIMITER = ",";

// Балл в файл пишется с ТОЧКОЙ, а не с запятой: запятая теперь разделяет
// колонки. На экране балл по-прежнему с запятой (formatScore) — там это
// уместно, а в файле рвало бы таблицу.
function csvScore(score: number | null): string {
    if (score === null || !Number.isFinite(score)) return "";
    return score.toFixed(SCORE_DECIMALS);
}

// Экранирование по RFC 4180: кавычка удваивается, а поле берётся в кавычки,
// если внутри есть разделитель, кавычка или перевод строки. Имена приходят из
// профиля, и запятая в фамилии не должна ломать таблицу.
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
    const body = rows.map((row, index) => [
        index + 1,
        row.name,
        csvScore(row.levelScore),
        row.gradeLevel ?? "",
    ]);

    const lines = [header, ...body].map((cells) => cells.map(escapeCell).join(DELIMITER));
    // BOM — чтобы Excel не принял UTF-8 за ANSI. Строки \r\n, а не \n: иначе
    // Excel на Windows показывает файл одной строкой.
    return `﻿${lines.join("\r\n")}\r\n`;
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
