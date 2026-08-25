"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Trophy, TrendingUp, TrendingDown, CheckCircle2, ChevronDown, Circle } from "lucide-react";
import {
    fetchClassMockResults,
    fetchMockAnswerDetails,
    ClassMockResultsSummary,
    MockAnswerDetail,
} from "@/lib/class-utils";

export default function ClassMockResultsPage() {
    const { id, mockTestId } = useParams();
    const classId = id as string;
    const testId = mockTestId as string;
    const router = useRouter();

    const [summary, setSummary] = useState<ClassMockResultsSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [openResultId, setOpenResultId] = useState<string | null>(null);
    const [details, setDetails] = useState<Record<string, MockAnswerDetail[]>>({});
    const [detailsLoading, setDetailsLoading] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setSummary(await fetchClassMockResults(classId, testId));
            setLoading(false);
        })();
    }, [classId, testId]);

    const toggleDetail = async (resultId: string) => {
        if (openResultId === resultId) {
            setOpenResultId(null);
            return;
        }
        setOpenResultId(resultId);
        if (!details[resultId]) {
            setDetailsLoading(resultId);
            const d = await fetchMockAnswerDetails(resultId);
            setDetails((prev) => ({ ...prev, [resultId]: d }));
            setDetailsLoading(null);
        }
    };

    if (loading || !summary) {
        return (
            <div className="flex flex-col gap-6">
                <div className="h-9 w-64 animate-pulse rounded-2xl bg-muted" />
                <div className="h-40 animate-pulse rounded-2xl border border-border bg-muted" />
            </div>
        );
    }

    const completionRate = summary.totalCount > 0 ? Math.round((summary.completedCount / summary.totalCount) * 100) : 0;

    return (
        <div className="flex flex-col gap-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section>
                <button onClick={() => router.push(`/classes/${classId}`)} className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
                    <ArrowLeft size={14} /> Назад к классу
                </button>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{summary.mockTitle}</h1>
                <p className="mt-2 text-sm text-muted-foreground">Результаты класса по этому Mock-тесту</p>
            </section>

            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 size={15} /><span className="text-[10px] font-bold uppercase tracking-widest">Прошли</span></div>
                    <p className="mt-2 text-2xl font-extrabold tabular-nums text-foreground">{summary.completedCount}/{summary.totalCount}</p>
                    <p className="text-xs text-muted-foreground">{completionRate}% класса</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2 text-muted-foreground"><Trophy size={15} /><span className="text-[10px] font-bold uppercase tracking-widest">Средний</span></div>
                    <p className="mt-2 text-2xl font-extrabold tabular-nums text-foreground">{summary.avgScore ?? "—"}{summary.avgScore !== null && "%"}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2 text-muted-foreground"><TrendingUp size={15} /><span className="text-[10px] font-bold uppercase tracking-widest">Максимум</span></div>
                    <p className="mt-2 text-2xl font-extrabold tabular-nums text-foreground">{summary.maxScore ?? "—"}{summary.maxScore !== null && "%"}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2 text-muted-foreground"><TrendingDown size={15} /><span className="text-[10px] font-bold uppercase tracking-widest">Минимум</span></div>
                    <p className="mt-2 text-2xl font-extrabold tabular-nums text-foreground">{summary.minScore ?? "—"}{summary.minScore !== null && "%"}</p>
                </div>
            </section>

            <section>
                <h2 className="mb-5 text-xl font-bold tracking-tight text-foreground sm:text-2xl">Ученики</h2>
                <div className="space-y-3">
                    {summary.students.map(({ student, resultId, score, correctAnswers, totalQuestions, raschScore, completedAt }) => {
                        const isOpen = openResultId === resultId;
                        return (
                            <div key={student.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                                <button
                                    onClick={() => resultId && toggleDetail(resultId)}
                                    disabled={!resultId}
                                    className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/40 disabled:cursor-default"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted font-bold text-foreground">
                                            {student.name[0]?.toUpperCase() || "?"}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-foreground">{student.name} {student.surname || ""}</p>
                                            {completedAt ? (
                                                <p className="text-xs text-muted-foreground">{correctAnswers}/{totalQuestions} верно • {new Date(completedAt).toLocaleDateString("ru-RU")}</p>
                                            ) : (
                                                <p className="text-xs text-muted-foreground">Ещё не проходил(а)</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        {raschScore !== null && (
                                            <span className="rounded-xl border border-border px-2.5 py-1.5 text-xs font-semibold tabular-nums text-muted-foreground" title="Rasch-оценка способности (θ), отдельно от процента">
                                                θ {raschScore >= 0 ? "+" : ""}{raschScore.toFixed(2)}
                                            </span>
                                        )}
                                        {score !== null ? (
                                            <span className={`rounded-xl px-3 py-1.5 text-sm font-extrabold tabular-nums ${score >= 80 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : score >= 50 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40" : "bg-red-50 text-red-700 dark:bg-red-950/40"}`}>
                                                {score}%
                                            </span>
                                        ) : (
                                            <Circle size={16} className="text-muted-foreground/40" />
                                        )}
                                        {resultId && (
                                            <ChevronDown size={16} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                        )}
                                    </div>
                                </button>

                                {isOpen && resultId && (
                                    <div className="border-t border-border bg-muted/30 p-4">
                                        {detailsLoading === resultId ? (
                                            <div className="space-y-2">
                                                {[1, 2, 3].map((n) => <div key={n} className="h-12 animate-pulse rounded-xl bg-muted" />)}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {(details[resultId] || []).map((d, i) => (
                                                    <div key={d.id} className="rounded-xl border border-border bg-card p-3">
                                                        <p className="text-sm font-medium text-foreground">{i + 1}. {d.questionText}</p>
                                                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                                            <span className={d.isCorrect ? "text-emerald-600" : "text-red-600"}>
                                                                Ответ ученика: <strong>{d.selectedAnswer || "—"}</strong>
                                                            </span>
                                                            {!d.isCorrect && (
                                                                <span className="text-muted-foreground">
                                                                    Правильный: <strong className="text-foreground">{d.correctAnswer}</strong>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
