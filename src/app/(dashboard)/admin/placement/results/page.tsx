"use client";

import { useEffect, useState } from "react";
import { BarChart3, X } from "lucide-react";
import supabase from "@/lib/supabase/client";

type AnswerItem = { questionId: string; questionText: string; selectedAnswer: string; isCorrect: boolean; pointsEarned: number };

type PlacementResultRow = {
    id: string;
    user_name: string;
    user_surname?: string;
    user_phone?: string;
    test_title: string;
    score: number;
    total_questions: number;
    correct_answers: number;
    accuracy: number;
    time_spent_seconds: number;
    completed_at: string;
    answers?: AnswerItem[];
};

export default function AdminPlacementResultsPage() {
    const [results, setResults] = useState<PlacementResultRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<PlacementResultRow | null>(null);

    const load = async () => {
        setLoading(true);
        const { data } = await supabase.from("placement_results").select("*").order("completed_at", { ascending: false });
        if (data) setResults(data as PlacementResultRow[]);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const fmtDate = (d: string) => new Date(d).toLocaleString("ru-RU");

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Результаты Placement</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Все прохождения вступительного тестирования.
                </p>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-20 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : results.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">Пока нет результатов.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {results.map((r) => (
                            <div
                                key={r.id}
                                className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:bg-muted/40 sm:flex-row sm:items-center"
                            >
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-foreground">{r.user_name} {r.user_surname || ""}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{r.user_phone || "—"} • {r.test_title}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{fmtDate(r.completed_at)}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <p className="text-lg font-bold tabular-nums text-foreground">{r.accuracy}%</p>
                                        <p className="text-xs text-muted-foreground">{r.correct_answers}/{r.total_questions} правильных</p>
                                    </div>
                                    <button
                                        onClick={() => setSelected(r)}
                                        className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors"
                                    >
                                        <BarChart3 size={16} /> Детали
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {selected && (
                <div className="fixed inset-0 z-[500] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelected(null)}>
                    <div className="w-full max-w-2xl rounded-3xl border border-border bg-card shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-7">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-foreground">Детализация</h2>
                                <button onClick={() => setSelected(null)} className="h-9 w-9 rounded-2xl border border-border bg-card hover:bg-muted transition-colors flex items-center justify-center"><X size={16} /></button>
                            </div>
                            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                                {selected.answers?.map((a, i) => (
                                    <div key={i} className={`rounded-xl border p-4 ${a.isCorrect ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30" : "border-red-200 bg-red-50 dark:bg-red-950/30"}`}>
                                        <p className="text-sm font-medium text-foreground">{i + 1}. {a.questionText}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">Ответ: {a.selectedAnswer || "—"} {a.isCorrect ? "✓" : "✗"}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
