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

export type ExportRow = {
    name: string;
    shortId: string;
    correctAnswers: number | null;
    totalQuestions: number | null;
    accuracy: number | null;
    levelScore: number | null;
    levelScoreMax: number | null;
    gradeLevel: string | null;
    completedAt: string | null;
    pendingReviewCount: number;
};

export type ExportLabels = {
    number: string;
    student: string;
    studentId: string;
    correct: string;
    ofQuestions: string;
    accuracy: string;
    score: string;
    scoreMax: string;
    level: string;
    completedAt: string;
    status: string;
    statusDone: string;
    statusPending: string;
    statusNotTaken: string;
};

const DELIMITER = ";";

// Экранирование по RFC 4180: кавычка удваивается, а поле берётся в кавычки,
// если внутри есть разделитель, кавычка или перевод строки. Имена учеников
// приходят из профиля, и запятая в фамилии не должна ломать таблицу.
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
    const header = [
        labels.number,
        labels.student,
        labels.studentId,
        labels.correct,
        labels.ofQuestions,
        labels.accuracy,
        labels.score,
        labels.scoreMax,
        labels.level,
        labels.completedAt,
        labels.status,
    ];

    const body = rows.map((row, index) => {
        const status = row.completedAt === null
            ? labels.statusNotTaken
            : row.pendingReviewCount > 0
                ? labels.statusPending
                : labels.statusDone;
        return [
            index + 1,
            row.name,
            row.shortId,
            row.correctAnswers,
            row.totalQuestions,
            row.accuracy,
            row.levelScore,
            row.levelScoreMax,
            row.gradeLevel ?? "",
            // Дата в ISO-виде «ГГГГ-ММ-ДД ЧЧ:ММ»: Excel распознаёт её как дату
            // при любой локали, в отличие от «06.09.2026», которое на
            // американской раскладке читается как 9 июня.
            row.completedAt ? row.completedAt.replace("T", " ").slice(0, 16) : "",
            status,
        ];
    });

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
