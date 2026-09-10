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
/**
 * Сколько рисунков режем и заливаем одновременно.
 *
 * Строгая очередь обходилась даром, пока вырезка вообще не работала: она
 * падала у всех заданий сразу. Теперь это настоящая работа внутри запроса
 * импорта — рендер страницы плюс заливка на каждый рисунок, десяток заданий у
 * обычного математического теста, — а за время импорта владелец уже спрашивал
 * отдельно. Четыре: рендер mupdf упирается в процессор, и большим числом
 * параллельных страниц на маленькой serverless-машине выигрыша нет.
 */
export const FIGURE_CONCURRENCY = 4;

export async function attachQuestionFigures(
    questions: readonly FigureCandidate[],
    files: readonly FigureSource[],
    upload: FigureUploader,
    pathFor: (question: FigureCandidate, index: number) => string,
): Promise<FigureOutcome[]> {
    const cropOne = async (question: FigureCandidate, index: number): Promise<FigureOutcome> => {
        const decision = figureDecision(question, files.length);
        if (!decision.crop) return { status: "SKIPPED", reason: decision.reason };
        try {
            const { png } = await cropFigureToPng(
                files[question.sourceFileIndex].bytes,
                question.sourcePage,
                decision.box,
            );
            const uploaded = await upload(pathFor(question, index), png);
            if ("error" in uploaded) return { status: "FAILED", reason: uploaded.error };
            return { status: "ATTACHED", url: uploaded.url, bytes: png.length };
        } catch (error) {
            return { status: "FAILED", reason: error instanceof Error ? error.message : String(error) };
        }
    };

    // Результат раскладывается ПО ИНДЕКСУ, а не в порядке готовности: вызывающий
    // сопоставляет outcomes[i] со своим questions[i], и перепутанный порядок
    // привязал бы рисунок к чужому заданию.
    const results: FigureOutcome[] = new Array(questions.length);
    for (let start = 0; start < questions.length; start += FIGURE_CONCURRENCY) {
        const batch = questions.slice(start, start + FIGURE_CONCURRENCY);
        const done = await Promise.all(batch.map((question, offset) => cropOne(question, start + offset)));
        done.forEach((outcome, offset) => { results[start + offset] = outcome; });
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
    // Раньше здесь стояло «для них останется разворот страницы» — и это был
    // худший из возможных исходов: ученику открывался ВЕСЬ PDF теста. Разворот
    // убран, а рисунок теперь доливается кнопкой у задания, о чём и говорим.
    if (noBox > 0) parts.push(`не удалось определить рамку у ${noBox} — загрузите рисунок кнопкой у задания`);
    if (failed > 0) {
        // ПРИЧИНУ обязательно словами, а не только счётчиком. Первый же прогон
        // на сервере дал «сбой вырезки у 10» — и по этой строке нельзя было
        // понять ровным счётом ничего: ни что упало, ни где. Один и тот же
        // текст ошибки у всех десяти означает общую поломку (не собрался
        // рендерер, нет доступа к хранилищу), разный — беду с конкретными
        // страницами. Это разные починки, и различать их надо сразу.
        const reasons = Array.from(new Set(
            outcomes.filter((o): o is Extract<FigureOutcome, { status: "FAILED" }> => o.status === "FAILED")
                .map((o) => o.reason),
        )).slice(0, 3);
        parts.push(`сбой вырезки у ${failed} (${reasons.join(" | ")})`);
    }
    return parts.join("; ") + ".";
}
