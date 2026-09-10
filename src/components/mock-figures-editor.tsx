"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X, ImageOff } from "lucide-react";
import supabase from "@/lib/supabase/client";
import QuestionFigureSlot from "@/components/question-figure-slot";
import { uploadQuestionFigure } from "@/lib/question-figure-upload";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Рисунки уже опубликованного теста.
//
// ═══ ЗАЧЕМ ОТДЕЛЬНЫЙ ЭКРАН ═══
//
// Публикация теста без рисунка не запрещена (решение владельца), а рамку
// рисунка модель находит не всегда. Значит опубликованный тест с пустым
// заданием — не исключение, а обычное дело, и лечить его повторным импортом
// пятидесяти пяти вопросов нельзя: заново пришлось бы проверять всё.
//
// Здесь показаны только те задания, у которых рисунок есть или нужен, и правка
// каждого — один вызов set_question_figure (миграция 113).

type FigureQuestion = {
    id: string;
    number: string;
    text: string;
    page: number | null;
    fileIndex: number;
    imageUrl: string | null;
    needsFigure: boolean;
};

type QuestionRow = {
    id: string;
    section_id: string;
    text: string | null;
    content: { number?: string; needsSourceImage?: boolean } | null;
    image_url: string | null;
    source_page: number | null;
    source_file_index: number | null;
    order: number;
};

export default function MockFiguresEditor({
    testId, title, onClose,
}: { testId: string; title: string; onClose: () => void }) {
    const t = useTranslations("mockTestStudio");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [questions, setQuestions] = useState<FigureQuestion[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: sections, error: sectionsError } = await supabase
                .from("mock_sections")
                .select("id")
                .eq("mock_test_id", testId)
                .order("order");
            if (sectionsError) throw sectionsError;
            const sectionIds = (sections || []).map((section) => section.id as string);
            if (sectionIds.length === 0) {
                setQuestions([]);
                return;
            }
            const { data: rows, error: questionsError } = await supabase
                .from("mock_questions")
                .select("id,section_id,text,content,image_url,source_page,source_file_index,order")
                .in("section_id", sectionIds)
                .order("order");
            if (questionsError) throw questionsError;
            const figures = ((rows || []) as QuestionRow[])
                // Только те, у кого рисунок есть или нужен: остальные заняли бы
                // весь экран и спрятали как раз то, за чем сюда пришли.
                .filter((row) => row.content?.needsSourceImage || row.image_url)
                .map((row) => ({
                    id: row.id,
                    number: row.content?.number || "",
                    text: row.text || "",
                    page: row.source_page,
                    fileIndex: row.source_file_index ?? 0,
                    imageUrl: row.image_url,
                    needsFigure: Boolean(row.content?.needsSourceImage),
                }));
            setQuestions(figures);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : String(loadError));
        } finally {
            setLoading(false);
        }
    }, [testId]);

    useEffect(() => { void load(); }, [load]);

    // Одна точка записи на все три действия: ссылка и флаг «нужен рисунок»
    // меняются вместе, иначе content пришлось бы читать и перезаписывать целиком.
    const save = async (question: FigureQuestion, imageUrl: string | null, needsFigure: boolean) => {
        const { error: rpcError } = await supabase.rpc("set_question_figure", {
            p_question_id: question.id,
            p_image_url: imageUrl,
            p_needs_figure: needsFigure,
        });
        if (rpcError) throw rpcError;
        setQuestions((current) => current.map((item) => (
            item.id === question.id ? { ...item, imageUrl, needsFigure } : item
        )));
    };

    const missing = questions.filter((question) => question.needsFigure && !question.imageUrl).length;

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold">{t("figuresModalTitle")}</h3>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{title}</p>
                    </div>
                    <button onClick={onClose} className="rounded-xl p-2 hover:bg-muted"><X size={18} /></button>
                </div>

                {loading ? (
                    <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> {t("figuresLoading")}</p>
                ) : error ? (
                    <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/30">{error}</p>
                ) : questions.length === 0 ? (
                    <p className="mt-6 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">{t("figuresEmpty")}</p>
                ) : (
                    <>
                        {missing > 0 && (
                            <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                                <ImageOff size={15} /> {t("figuresMissingSummary")
                                    .replace("{missing}", String(missing))
                                    .replace("{total}", String(questions.filter((question) => question.needsFigure).length))}
                            </p>
                        )}
                        <div className="mt-4 space-y-4">
                            {questions.map((question) => (
                                <div key={question.id} className="rounded-xl border border-border p-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
                                            {question.number || "—"}
                                        </span>
                                        {question.page && (
                                            <span className="text-xs text-muted-foreground">
                                                {t("figuresPageLabel").replace("{page}", String(question.page))}
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{question.text}</p>
                                    <QuestionFigureSlot
                                        imageUrl={question.imageUrl}
                                        needsFigure={question.needsFigure}
                                        numberLabel={question.number || "—"}
                                        page={question.page}
                                        onUpload={async (file) => {
                                            const url = await uploadQuestionFigure(file, { mockTestId: testId }, question.number || question.id);
                                            await save(question, url, true);
                                        }}
                                        // Убрали картинку — задание снова ждёт рисунок,
                                        // и счётчик обязан это показать.
                                        onClear={() => save(question, null, true)}
                                        onNoFigure={() => save(question, null, false)}
                                        onOpenSource={question.page
                                            ? () => {
                                                window.open(
                                                    `/api/mock-tests/${testId}/source?page=${question.page}&file=${question.fileIndex}`,
                                                    "_blank",
                                                    "noopener,noreferrer",
                                                );
                                            }
                                            : undefined}
                                    />
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
