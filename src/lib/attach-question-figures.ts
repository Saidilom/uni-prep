// Вырезание рисунков заданий из исходных PDF и раскладка их по хранилищу.
//
// Вызывается один раз, сразу после распознавания: пока байты PDF всё равно в
// памяти, дешевле вырезать здесь, чем потом при каждом показе задания.
//
// ═══ ЧТО ЗДЕСЬ ВАЖНО ═══
//
// Сбой одной картинки НЕ роняет импорт. Распознавание — самая дорогая часть
// (оно платное и идёт минуты), и уронить его из-за того, что модель назвала
// кривую рамку у одного задания из полусотни, было бы неприемлемо. Задание без
// картинки остаётся с прежним поведением: разворот исходной страницы.
//
// Поэтому функция возвращает не только число вырезанных, но и причины отказов —
// они уходят в предупреждения импорта, чтобы учитель видел, где картинки не
// будет, а не гадал (§233).

import { prepareFigureBox, cropFigureToPng, BoxRejection } from "./pdf-figure-crop";

export type FigureSource = {
    /** Байты PDF в том же порядке, в каком файлы отдавались модели. */
    bytes: Uint8Array;
};

/** Минимум того, что нужно от вопроса черновика. */
export type FigureCandidate = {
    number: string;
    sourcePage: number;
    sourceFileIndex: number;
    needsSourceImage: boolean;
    figureBox: { x: number; y: number; width: number; height: number } | null;
};

export type FigureOutcome =
    | { status: "ATTACHED"; url: string; bytes: number }
    | { status: "SKIPPED"; reason: BoxRejection | "NO_FIGURE" | "NO_SOURCE_FILE" }
    | { status: "FAILED"; reason: string };

export type FigureUploader = (
    path: string,
    png: Uint8Array,
) => Promise<{ url: string } | { error: string }>;

/**
 * Вырезает рисунок одного задания.
 *
 * Отделено от прохода по всем заданиям, чтобы решение «вырезать или нет»
 * можно было проверить тестом без PDF и без хранилища.
 */
export function figureDecision(
    question: FigureCandidate,
    fileCount: number,
): { crop: true; box: { x: number; y: number; width: number; height: number } } | { crop: false; reason: BoxRejection | "NO_FIGURE" | "NO_SOURCE_FILE" } {
    if (!question.needsSourceImage) return { crop: false, reason: "NO_FIGURE" };
    if (question.sourceFileIndex < 0 || question.sourceFileIndex >= fileCount) {
        // Модель сослалась на файл, которого нет. Взять первый «на всякий
        // случай» значило бы вырезать кусок чужого документа.
        return { crop: false, reason: "NO_SOURCE_FILE" };
    }
    const checked = prepareFigureBox(question.figureBox);
    if (!checked.ok) return { crop: false, reason: checked.reason };
    return { crop: true, box: checked.box };
}

/**
 * Проходит по всем заданиям черновика, вырезает рисунки и отдаёт результат по
 * каждому. Ничего не мутирует: вызывающий сам решает, что записать в черновик.
 */
export async function attachQuestionFigures(
    questions: readonly FigureCandidate[],
    files: readonly FigureSource[],
    upload: FigureUploader,
    pathFor: (question: FigureCandidate, index: number) => string,
): Promise<FigureOutcome[]> {
    const results: FigureOutcome[] = [];
    for (let index = 0; index < questions.length; index++) {
        const question = questions[index];
        const decision = figureDecision(question, files.length);
        if (!decision.crop) {
            results.push({ status: "SKIPPED", reason: decision.reason });
            continue;
        }
        try {
            const { png } = await cropFigureToPng(
                files[question.sourceFileIndex].bytes,
                question.sourcePage,
                decision.box,
            );
            const uploaded = await upload(pathFor(question, index), png);
            if ("error" in uploaded) {
                results.push({ status: "FAILED", reason: uploaded.error });
                continue;
            }
            results.push({ status: "ATTACHED", url: uploaded.url, bytes: png.length });
        } catch (error) {
            results.push({
                status: "FAILED",
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return results;
}

/** Короткая сводка для предупреждений импорта. Пусто — говорить не о чем. */
export function summarizeFigures(outcomes: readonly FigureOutcome[]): string | null {
    const attached = outcomes.filter((o) => o.status === "ATTACHED").length;
    const failed = outcomes.filter((o) => o.status === "FAILED").length;
    // Заданий без рисунка большинство, и молчать о них — правильно.
    const noBox = outcomes.filter(
        (o) => o.status === "SKIPPED" && (o.reason === "NO_BOX" || o.reason === "OUT_OF_RANGE" || o.reason === "TOO_SMALL"),
    ).length;
    if (attached === 0 && failed === 0 && noBox === 0) return null;

    const parts = [`Рисунков вырезано: ${attached}`];
    if (noBox > 0) parts.push(`не удалось определить рамку у ${noBox} — для них останется разворот страницы`);
    if (failed > 0) parts.push(`сбой вырезки у ${failed}`);
    return parts.join("; ") + ".";
}
