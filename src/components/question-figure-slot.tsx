"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, ExternalLink, ImageOff, AlertTriangle } from "lucide-react";
import { checkFigureFile, MAX_FIGURE_BYTES } from "@/lib/question-figure";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Рисунок одного задания: показать, загрузить, заменить, убрать.
//
// Один и тот же слот стоит и в студии (черновик до публикации), и на экране
// «Рисунки» у опубликованного теста. Отсюда он ничего не знает ни про импорт,
// ни про базу: получает ссылку и три обработчика, а куда именно уедет файл —
// забота того, кто его поставил.
//
// Проверку файла и показ ошибки слот делает сам. Иначе каждый из двух хозяев
// писал бы свои сообщения про «нужен PNG» и «слишком большой», и они бы
// разошлись — а человек в обоих местах делает одно и то же действие.

type Props = {
    /** Готовая ссылка на рисунок; null — рисунка нет. */
    imageUrl: string | null;
    /** Модель отметила, что задание без рисунка не решается. */
    needsFigure: boolean;
    /** Номер задания, как он напечатан в тесте: «40a». */
    numberLabel: string;
    /** Страница исходного PDF, где рисунок напечатан. */
    page: number | null;
    onUpload: (file: File) => Promise<void>;
    onClear: () => Promise<void> | void;
    /** Снять отметку «нужен рисунок»: модель иногда отмечает лишнее. */
    onNoFigure?: () => Promise<void> | void;
    /** Открыть страницу источника, чтобы увидеть, что вырезать. */
    onOpenSource?: () => Promise<void> | void;
    disabled?: boolean;
};

export default function QuestionFigureSlot({
    imageUrl, needsFigure, numberLabel, page, onUpload, onClear, onNoFigure, onOpenSource, disabled,
}: Props) {
    const t = useTranslations("questionFigure");
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);

    const take = async (file: File | undefined | null) => {
        if (!file || busy || disabled) return;
        const checked = checkFigureFile(file);
        if (!checked.ok) {
            setError(
                checked.reason === "TYPE"
                    ? t("errorType")
                    : checked.reason === "SIZE"
                        ? t("errorSize").replace("{mb}", String(Math.round(MAX_FIGURE_BYTES / (1024 * 1024))))
                        : t("errorEmpty"),
            );
            return;
        }
        setError(null);
        setBusy(true);
        try {
            await onUpload(file);
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
        } finally {
            setBusy(false);
        }
    };

    const run = async (action: () => Promise<void> | void) => {
        if (busy || disabled) return;
        setBusy(true);
        setError(null);
        try {
            await action();
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : String(actionError));
        } finally {
            setBusy(false);
        }
    };

    const pick = () => inputRef.current?.click();

    const hiddenInput = (
        <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void take(file);
            }}
        />
    );

    const errorLine = error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
        </p>
    );

    const sourceButton = onOpenSource && page && (
        <button
            type="button"
            onClick={() => void run(onOpenSource)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
        >
            <ExternalLink size={13} /> {t("openSourceAction").replace("{page}", String(page))}
        </button>
    );

    // ═══ Рисунок есть ═══
    if (imageUrl) {
        return (
            <div className="mt-3">
                {hiddenInput}
                <div className="overflow-hidden rounded-xl border border-border bg-white">
                    {/* Обычный img, а не next/image: ссылка приходит из хранилища,
                        картинка уже готового размера, и оптимизатор ей не нужен. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={imageUrl}
                        alt={t("previewAlt").replace("{number}", numberLabel)}
                        className="mx-auto max-h-64 w-auto max-w-full object-contain"
                    />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={pick}
                        disabled={busy || disabled}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                    >
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} {t("replaceAction")}
                    </button>
                    <button
                        type="button"
                        onClick={() => void run(onClear)}
                        disabled={busy || disabled}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30"
                    >
                        <Trash2 size={13} /> {t("removeAction")}
                    </button>
                    {sourceButton}
                </div>
                {errorLine}
            </div>
        );
    }

    // ═══ Рисунок нужен, но его нет ═══
    //
    // Янтарная рамка и заметный блок — осознанно. Публикация без рисунка не
    // запрещена (решение владельца), и единственное, что стоит между пустым
    // заданием и учеником, — это чтобы человек его тут увидел.
    if (needsFigure) {
        return (
            <div
                className={`mt-3 rounded-xl border-2 border-dashed p-3 transition ${
                    dragging ? "border-amber-500 bg-amber-100/60 dark:bg-amber-950/40" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
                }`}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); void take(event.dataTransfer.files?.[0]); }}
                // Вставка из буфера: скриншот чаще всего лежит именно там, и
                // заставлять сохранять его файлом ради загрузки — лишний шаг.
                onPaste={(event) => { const file = event.clipboardData.files?.[0]; if (file) { event.preventDefault(); void take(file); } }}
                tabIndex={0}
            >
                {hiddenInput}
                <p className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-300">
                    <ImageOff size={14} /> {t("needFigureTitle")}
                </p>
                <p className="mt-1 text-[11px] text-amber-800/80 dark:text-amber-300/70">{t("needFigureHint")}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={pick}
                        disabled={busy || disabled}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                        {busy ? t("uploadingLabel") : t("uploadAction")}
                    </button>
                    {sourceButton}
                    {onNoFigure && (
                        <button
                            type="button"
                            onClick={() => void run(onNoFigure)}
                            disabled={busy || disabled}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-background px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
                        >
                            {t("noFigureAction")}
                        </button>
                    )}
                </div>
                {errorLine}
            </div>
        );
    }

    // ═══ Рисунка не требуется ═══
    //
    // Кнопка всё равно нужна: модель рисунок иногда пропускает, и без этого
    // пути добавить его было бы нечем.
    return (
        <div className="mt-3">
            {hiddenInput}
            <button
                type="button"
                onClick={pick}
                disabled={busy || disabled}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} {t("addAction")}
            </button>
            {errorLine}
        </div>
    );
}
