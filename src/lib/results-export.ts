// Выгрузка результатов мока в настоящий Excel-файл (.xlsx).
//
// До этого выгружался CSV, и он дважды подвёл на локали. Сначала разделителем
// стояла точка с запятой плюс директива `sep=;` — Excel владельца её
// проигнорировал и вывел отдельной строкой как текст. Потом разделитель сменили
// на запятую, но тогда балл «99,8» пришлось писать с точкой, иначе строка
// «1;Lola Xurramova;99,8;A+» распадалась на «1;Lola Xurramova;99» и «8;A+».
//
// Корень в том, что у CSV нет типов: и разделитель колонок, и десятичный
// разделитель зависят от локали читающего, и одновременно угадать оба нельзя.
// У .xlsx этой проблемы не существует — балл лежит в файле ЧИСЛОМ, а как его
// отрисовать (99.8 или 99,8), Excel решает сам по своим настройкам. Заодно по
// колонке сразу работают СРЗНАЧ и сортировка: числу не нужно объяснять, что оно
// число.
//
// Пакет — `write-excel-file`: 0 уязвимостей на момент подключения, одна
// зависимость (fflate, и она уже была в дереве через @react-three/drei). Прежде
// отвергнутые варианты были хуже: у `xlsx` с npm две неисправленных уязвимости
// (пакет заброшен на 0.18.5), у `exceljs` — 23 МБ и замечание через зависимость.
//
// Здесь только ЧИСТОЕ построение данных листа — без импорта пакета в рантайме,
// чтобы модуль оставался тестируемым в Node (см. CLAUDE.md про юнит-тесты).
// Сам вызов writeXlsxFile и скачивание — на странице.
//
// Колонок намеренно четыре. Сначала выгружались ещё ID ученика, число верных,
// процент, дата и статус — владелец попросил оставить только то, ради чего
// таблицу открывают: кто, сколько баллов, какой уровень.

import type { SheetData } from "write-excel-file/browser";

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

// Формат числа для Excel: ровно один знак после запятой, как и на экране.
// Без него балл 99 показался бы как «99», а 99.8 как «99,8» — в одной колонке
// вперемешку. Сам символ разделителя подставляет Excel по своей локали.
const SCORE_FORMAT = `0.${"0".repeat(SCORE_DECIMALS)}`;

// Ширины колонок в символах. Имя с фамилией у узбекских ФИО легко занимает
// 30+ знаков, а по умолчанию колонка узкая и текст обрезается — открывшему
// пришлось бы растягивать её руками при каждой выгрузке.
export const RESULTS_COLUMN_WIDTHS = [6, 34, 10, 12];

export function buildResultsSheet(rows: ExportRow[], labels: ExportLabels): SheetData {
    const header = [labels.number, labels.student, labels.score, labels.level].map((value) => ({
        value,
        type: String,
        fontWeight: "bold" as const,
    }));

    const body = rows.map((row, index) => [
        { value: index + 1, type: Number },
        { value: row.name, type: String },
        // Балл — число, а не строка. Непосчитанный балл остаётся ПУСТОЙ ячейкой:
        // ноль читался бы как настоящий результат ученика.
        row.levelScore === null || !Number.isFinite(row.levelScore)
            ? null
            : { value: row.levelScore, type: Number, format: SCORE_FORMAT },
        { value: row.gradeLevel ?? "", type: String },
    ]);

    return [header, ...body];
}

// Имя файла из названия теста: убираем то, что файловые системы не принимают,
// и подрезаем длину — названия моков бывают в целую строку.
export function exportFileName(title: string, date = ""): string {
    const safe = title
        .replace(/[\\/:*?"<>|]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60) || "results";
    return `${safe}${date ? ` ${date}` : ""}.xlsx`;
}
