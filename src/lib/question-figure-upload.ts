"use client";

import supabase from "@/lib/supabase/client";
import { checkFigureFile, MAX_FIGURE_BYTES, QUESTION_FIGURES_BUCKET } from "./question-figure";

// Заливка рисунка задания из браузера.
//
// Два шага, как у исходных PDF (mock-test-studio: uploadStoredFile): роут
// выдаёт одноразовую подписанную ссылку, файл едет по ней прямо в хранилище.
// Через наш сервер картинку не гоняем — незачем.

/** Куда относится рисунок: к черновику импорта или к опубликованному тесту. */
export type FigureScope = { importId: string } | { mockTestId: string };

/**
 * Заливает файл и возвращает публичную ссылку.
 *
 * `key` — только читаемая часть имени (номер задания). Уникальность обеспечивает
 * роут, а не она.
 */
export async function uploadQuestionFigure(file: File, scope: FigureScope, key: string): Promise<string> {
    // Проверяем и здесь тоже: слот проверяет для человека, роут — потому что
    // клиенту нельзя верить, а этот шаг спасает от бессмысленного обращения к
    // сети с заведомо негодным файлом.
    const checked = checkFigureFile(file);
    if (!checked.ok) {
        throw new Error(
            checked.reason === "TYPE"
                ? "Рисунок должен быть картинкой: PNG, JPEG или WebP"
                : checked.reason === "SIZE"
                    ? `Картинка должна быть меньше ${Math.round(MAX_FIGURE_BYTES / (1024 * 1024))} MB`
                    : "Файл пустой",
        );
    }

    const response = await fetch("/api/mock-tests/figures/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scope, key, contentType: checked.mime, size: file.size }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Не удалось подготовить загрузку рисунка");

    const { error } = await supabase.storage
        .from(QUESTION_FIGURES_BUCKET)
        .uploadToSignedUrl(body.path as string, body.token as string, file, { contentType: checked.mime });
    if (error) throw error;
    return body.publicUrl as string;
}

/**
 * Свежая ссылка на страницу исходного PDF ещё не опубликованного теста.
 *
 * Не берём previewUrl из ответа импорта: он живёт час, а разбор заданий идёт
 * дольше, и кнопка молча перестала бы открывать что-либо.
 */
export async function openImportSourcePage(path: string, page: number): Promise<void> {
    const response = await fetch(`/api/mock-tests/import/source-url?path=${encodeURIComponent(path)}&page=${page}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Не удалось открыть страницу источника");
    window.open(body.url as string, "_blank", "noopener,noreferrer");
}
