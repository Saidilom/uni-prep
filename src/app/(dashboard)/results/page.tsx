"use client";

import { useEffect, useState } from "react";
import { Trophy, Calendar, Clock } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import supabase from "@/lib/supabase/client";

type ResultRow = {
    id: string;
    mock_test_title: string;
    score: number;
    total_questions: number;
    correct_answers: number;
    completed_at: string;
};

const scoreColor = (score: number) =>
    score >= 80 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : score >= 50 ? "text-amber-600 bg-amber-50 dark:bg-amber-950/40" : "text-red-600 bg-red-50 dark:bg-red-950/40";

export default function ResultsPage() {
    const { user } = useAuthStore();
    const [results, setResults] = useState<ResultRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        (async () => {
            setLoading(true);
            const { data } = await supabase
                .from("mock_results")
                .select("id, mock_test_title, score, total_questions, correct_answers, completed_at")
                .eq("user_id", user.id)
                .order("completed_at", { ascending: false });
            setResults((data as ResultRow[]) || []);
            setLoading(false);
        })();
    }, [user]);

    const avgScore = results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length) : null;

    return (
        <div className="flex flex-col gap-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Результаты</h1>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                        История пройденных Mock-тестов.
                    </p>
                </div>
                {avgScore !== null ? (
                    <div className="flex items-center gap-3 self-start rounded-2xl border border-border bg-muted/50 px-5 py-3 dark:bg-muted/30">
                        <Trophy size={18} className="text-blue-600" />
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Средний балл</p>
                            <p className="text-xl font-extrabold tabular-nums text-foreground">{avgScore}%</p>
                        </div>
                    </div>
                ) : null}
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-20 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : results.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <Trophy size={28} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">Пока нет пройденных тестов.</p>
                        <p className="mt-1 text-sm text-muted-foreground/70">Результаты появятся здесь после первого Mock-теста.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {results.map((r) => (
                            <div
                                key={r.id}
                                className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-all hover:bg-muted/40 sm:flex-row sm:items-center"
                            >
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-foreground">{r.mock_test_title}</p>
                                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Calendar size={12} />
                                            {new Date(r.completed_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock size={12} />
                                            {r.correct_answers}/{r.total_questions} верно
                                        </span>
                                    </div>
                                </div>
                                <span className={`shrink-0 self-start rounded-xl px-4 py-2 text-sm font-extrabold tabular-nums sm:self-auto ${scoreColor(r.score)}`}>
                                    {r.score}%
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
