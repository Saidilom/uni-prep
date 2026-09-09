"use client";

import { useEffect, useState } from "react";
import { XCircle, CheckCircle2, MessageSquare } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Разбор ошибок для самого ученика.
//
// ═══ ЧТО ЗДЕСЬ НЕ ПОКАЗЫВАЕТСЯ ═══
//
// ПРАВИЛЬНЫЙ ОТВЕТ. Его не отдаёт и функция базы, и это не забывчивость:
// результаты публикуются по одной работе, и у одного ученика они могут быть
// открыты раньше, чем у остальных. Отдав ему ключ, мы отдали бы его всем, кто
// ещё не сдавал. Ученик видит, ГДЕ ошибся и что выбрал сам, а верный ответ
// разбирает с учителем — у того он на экране есть.
//
// ═══ ПО КАКИМ МОКАМ ═══
//
// Решать это интерфейс не может и не пытается: get_my_mock_answer_review
// (миграция 111) сама отдаёт строки только по разрешённым тестам —
// бесплатным и назначенным учителем, но не по «Ойлик» и не по платным,
// купленным самостоятельно. Если строк нет, блок просто не рисуется: врать
// «ошибок не было» там, где разбор закрыт, нельзя.

type ReviewRow = {
    question_id: string;
    question_text: string | null;
    selected_answer: string | null;
    is_correct: boolean;
    points_earned: number | null;
    max_points: number | null;
    review_status: string | null;
    review_feedback: string | null;
};

const NOT_ANSWERED = new Set(["null", "undefined", ""]);

export default function StudentMistakeReview({ resultId }: { resultId: string }) {
    const t = useTranslations("studentReport");
    const [rows, setRows] = useState<ReviewRow[] | null>(null);

    useEffect(() => {
        let active = true;
        (async () => {
            const { data } = await supabase.rpc("get_my_mock_answer_review", { p_result_id: resultId });
            if (active) setRows((data ?? []) as ReviewRow[]);
        })();
        return () => { active = false; };
    }, [resultId]);

    if (!rows || rows.length === 0) return null;

    // Нумерация — из ИСХОДНОГО порядка: «задание 7» должно остаться седьмым в
    // тесте, иначе сверить с работой нечем.
    const numbered = rows.map((row, i) => ({ row, number: i + 1 }));
    const wrong = numbered.filter((x) => !x.row.is_correct);
    if (wrong.length === 0) {
        return (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
                <CheckCircle2 size={14} /> {t("noMistakes")}
            </p>
        );
    }

    return (
        <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("mistakesTitle").replace("{count}", String(wrong.length)).replace("{total}", String(rows.length))}
            </p>
            <ul className="mt-2 space-y-1.5">
                {wrong.map(({ row, number }) => {
                    const answered = row.selected_answer !== null
                        && !NOT_ANSWERED.has(row.selected_answer.trim());
                    return (
                        <li key={row.question_id} className="rounded-xl border border-border bg-background p-3">
                            <div className="flex items-start gap-2">
                                <XCircle size={14} className="mt-0.5 shrink-0 text-red-600" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold text-foreground">
                                        {t("mistakeQuestionNumber").replace("{number}", String(number))}
                                    </p>
                                    {row.question_text && (
                                        <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                                            {row.question_text}
                                        </p>
                                    )}
                                    <p className="mt-1 text-xs">
                                        {/* «Не ответил» и «ответил неверно» — разные
                                            ошибки, и работать над ними надо по-разному. */}
                                        {answered ? (
                                            <span className="text-muted-foreground">
                                                {t("yourAnswerLabel")}{" "}
                                                <strong className="text-foreground">{row.selected_answer}</strong>
                                            </span>
                                        ) : (
                                            <span className="font-semibold text-amber-700 dark:text-amber-400">
                                                {t("notAnsweredLabel")}
                                            </span>
                                        )}
                                    </p>
                                    {/* Комментарий проверяющего — по сочинениям он
                                        и есть главное, что ученику надо прочесть. */}
                                    {row.review_feedback && (
                                        <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-muted px-2 py-1.5 text-xs leading-relaxed text-foreground">
                                            <MessageSquare size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                                            {row.review_feedback}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
