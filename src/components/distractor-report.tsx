"use client";

import { useEffect, useState } from "react";
import { ChevronDown, KeyRound, CircleOff, AlertTriangle } from "lucide-react";
import { fetchDistractorReport, DistractorQuestion } from "@/lib/class-utils";
import { useTranslations } from "@/lib/i18n/locale-provider";
import PanelSkeleton from "@/components/panel-skeleton";

// Разбор закрытых заданий по вариантам. ТЗ §R.7.
//
// Ничего не считает — показывает то, что записал /api/rasch/recalculate.
//
// ═══ КОМУ И ЗАЧЕМ ═══
//
// Экран методиста, а не ученика. Fit (модуль F) говорит «задание ведёт себя
// странно», а этот разбор говорит ПОЧЕМУ: видно, какой именно вариант
// притягивает сильных учеников.
//
// Таблица под ним раскрывает правильный ответ, поэтому доступ закрыт в RLS
// (миграция 103), а не тем, что блок не отрисован. У ученика выборка вернёт
// пусто, и блок исчезнет сам — но это следствие, а не защита.
//
// ═══ ЧТО ЗНАЧАТ ФЛАГИ ═══
//
// OUTPERFORMS_CORRECT — средняя способность выбравших дистрактор ВЫШЕ, чем у
// выбравших верный вариант. Самый прямой признак ошибки ключа: сильные
// ученики редко ошибаются дружно, а вот составитель ошибается.
//
// DEAD_DISTRACTOR — вариант не выбрал никто: задание из четырёх вариантов
// фактически работает как задание из трёх.
//
// LOW_COUNT — сравнение сделано на нескольких ответах. Флаг НЕ снимается, но
// читать его надо со счётчиком в руках.
//
// Ни один флаг не удаляет задание (§222, §224).

export type DistractorReportProps = { mockTestId: string };

const FLAG_ICON: Record<string, typeof KeyRound> = {
    OUTPERFORMS_CORRECT: KeyRound,
    DEAD_DISTRACTOR: CircleOff,
};

const fmtTheta = (v: number | null) =>
    v === null || !Number.isFinite(v) ? "—" : (v >= 0 ? "+" : "") + v.toFixed(2);

export default function DistractorReport({ mockTestId }: DistractorReportProps) {
    const t = useTranslations("distractorReport");
    const [questions, setQuestions] = useState<DistractorQuestion[] | null>(null);
    const [open, setOpen] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        (async () => {
            const data = await fetchDistractorReport(mockTestId);
            if (active) setQuestions(data);
        })();
        return () => { active = false; };
    }, [mockTestId]);

    // Грузится — держим место заглушкой; данных нет — панели нет вовсе.
    if (!questions) return <PanelSkeleton />;
    if (questions.length === 0) return null;

    const flagged = questions.filter((q) => q.flags.length > 0);
    const keySuspects = questions.filter((q) => q.flags.includes("OUTPERFORMS_CORRECT")).length;
    const deadOptions = questions.reduce(
        (sum, q) => sum + q.options.filter((o) => o.flags.includes("DEAD_DISTRACTOR")).length, 0);
    const visible = showAll ? questions : flagged;

    return (
        <div className="rounded-2xl border border-border bg-card">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
                <div className="flex items-center gap-3">
                    <AlertTriangle
                        size={18}
                        className={`shrink-0 ${flagged.length > 0 ? "text-amber-600" : "text-muted-foreground"}`}
                    />
                    <div>
                        <p className="text-sm font-bold text-foreground">{t("title")}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {/* Со знаменателем: «19 подозрений» без «из 130» не читается. */}
                            {t("summary")
                                .replace("{checked}", String(questions.length))
                                .replace("{suspects}", String(keySuspects))
                                .replace("{dead}", String(deadOptions))}
                        </p>
                    </div>
                </div>
                <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="border-t border-border px-5 py-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] leading-relaxed text-muted-foreground">{t("explain")}</p>
                        <button
                            type="button"
                            onClick={() => setShowAll((v) => !v)}
                            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground"
                        >
                            {showAll
                                ? t("showFlaggedOnly").replace("{count}", String(flagged.length))
                                : t("showAll").replace("{count}", String(questions.length))}
                        </button>
                    </div>

                    {visible.length === 0 ? (
                        <p className="rounded-xl bg-muted/50 px-4 py-3 text-xs font-semibold text-muted-foreground">
                            {t("noFlags")}
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {visible.map((q) => {
                                const expanded = openQuestionId === q.questionId;
                                return (
                                    <li key={q.questionId} className="rounded-xl border border-border">
                                        <button
                                            type="button"
                                            onClick={() => setOpenQuestionId(expanded ? null : q.questionId)}
                                            className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                                        >
                                            <div className="min-w-0">
                                                <p className="line-clamp-2 text-xs leading-relaxed text-foreground">
                                                    {q.text}
                                                </p>
                                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                    {q.flags.filter((f) => f !== "LOW_COUNT").map((flag) => {
                                                        const Icon = FLAG_ICON[flag] ?? AlertTriangle;
                                                        return (
                                                            <span
                                                                key={flag}
                                                                className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                                                            >
                                                                <Icon size={10} /> {t(flag === "OUTPERFORMS_CORRECT" ? "flagKeySuspect" : "flagDead")}
                                                            </span>
                                                        );
                                                    })}
                                                    {q.flags.includes("LOW_COUNT") && (
                                                        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                                                            {t("flagLowCount")}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {t("respondents").replace("{count}", String(q.respondents))}
                                                    </span>
                                                    {q.status !== "OK" && (
                                                        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                                                            {t(q.status === "TOO_FEW_RESPONSES" ? "statusTooFew" : "statusNoCorrect")}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <ChevronDown size={15} className={`mt-0.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                                        </button>

                                        {expanded && (
                                            <div className="border-t border-border px-4 py-3">
                                                <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                    <span>{t("optionColumn")}</span>
                                                    <span>{t("meanThetaColumn")}</span>
                                                </div>
                                                <ul className="space-y-1.5">
                                                    {q.options.map((o) => {
                                                        const suspect = o.flags.includes("OUTPERFORMS_CORRECT");
                                                        const dead = o.flags.includes("DEAD_DISTRACTOR");
                                                        return (
                                                            <li key={o.optionKey} className="flex items-center gap-3">
                                                                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-extrabold uppercase ${
                                                                    o.isCorrect
                                                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                                                                        : suspect
                                                                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                                                                            : "bg-muted text-muted-foreground"
                                                                }`}>
                                                                    {o.optionKey}
                                                                </span>
                                                                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                                                                    {o.label}
                                                                </span>
                                                                {/* Полоса доли: глазом видно, куда ушла группа. */}
                                                                <span className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:block">
                                                                    <span
                                                                        className={`block h-full ${o.isCorrect ? "bg-emerald-500" : suspect ? "bg-amber-500" : "bg-muted-foreground/40"}`}
                                                                        style={{ width: `${Math.min(100, o.share * 100)}%` }}
                                                                    />
                                                                </span>
                                                                <span className="w-14 shrink-0 text-right text-[11px] font-bold tabular-nums text-foreground">
                                                                    {(o.share * 100).toFixed(0)}%
                                                                </span>
                                                                <span className={`w-12 shrink-0 text-right text-[11px] font-bold tabular-nums ${
                                                                    suspect ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
                                                                }`}>
                                                                    {dead ? t("nobody") : fmtTheta(o.meanTheta)}
                                                                </span>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                                {q.omitted > 0 && (
                                                    <p className="mt-2 text-[10px] text-muted-foreground">
                                                        {t("omitted").replace("{count}", String(q.omitted))}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{t("noAutoRemoval")}</p>
                </div>
            )}
        </div>
    );
}
