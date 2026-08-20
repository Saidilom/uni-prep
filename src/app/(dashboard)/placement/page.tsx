"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Play, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/useToast";
import { fetchUserPlacementAssignments } from "@/lib/registan-utils";
import { markPlacementAssignmentsSeen } from "@/hooks/usePlacementNotifications";
import { pageCache } from "@/lib/page-cache";
import supabase from "@/lib/supabase/client";

// Raw row shape as Postgres/PostgREST actually returns it (snake_case) —
// NOT the camelCase `PlacementAssignment` type from firestore-schema.ts.
// `fetchUserPlacementAssignments` casts to that Firestore-era type, but the
// real columns are test_id/test_title/assigned_at, so a.testId/a.assignedAt
// were always undefined at runtime (cards rendered with no title/date).
type AssignmentRow = {
    id: string;
    test_id: string;
    test_title: string;
    status: string;
    assigned_at: string;
    passingScore: number;
    timeLimitMinutes?: number | null;
};

type ResultSummary = {
    percentage: number;
    score: number;
    total: number;
    correct_answers: number;
    completed_at: string;
};

export default function PlacementPage() {
    const { user } = useAuthStore();
    const toast = useToast();
    const router = useRouter();
    const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
    const [results, setResults] = useState<Record<string, ResultSummary>>({});
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            pageCache.invalidatePrefix("placementAssignments:");
            const data = (await fetchUserPlacementAssignments(user.id)) as unknown as Array<{
                id: string;
                test_id: string;
                test_title: string;
                status: string;
                assigned_at: string;
            }>;

            const enriched: AssignmentRow[] = [];
            const testIds = new Set<string>();

            for (const a of data) {
                if (a.test_id) testIds.add(a.test_id);
            }

            const testMap: Record<string, { passingScore: number; durationMinutes: number }> = {};
            for (const tid of Array.from(testIds)) {
                const { data: td } = await supabase
                    .from("placement_tests")
                    .select("passing_score, time_limit_minutes")
                    .eq("id", tid)
                    .single();
                if (td) {
                    testMap[tid] = {
                        passingScore: Number(td.passing_score ?? 0),
                        durationMinutes: Number(td.time_limit_minutes ?? 0),
                    };
                }
            }

            for (const a of data) {
                const test = testMap[a.test_id];
                enriched.push({
                    ...a,
                    passingScore: test?.passingScore || 0,
                    timeLimitMinutes: test?.durationMinutes ?? null,
                });
            }

            setAssignments(enriched);

            const completedIds = enriched.filter((a) => a.status === "completed").map((a) => a.id);
            const resultMap: Record<string, ResultSummary> = {};
            for (const aid of completedIds) {
                const { data: rd } = await supabase
                    .from("placement_results")
                    .select("accuracy, score, total_questions, correct_answers, completed_at")
                    .eq("assignment_id", aid)
                    .single();
                if (rd) {
                    resultMap[aid] = {
                        percentage: rd.accuracy,
                        score: rd.score,
                        total: rd.total_questions,
                        correct_answers: rd.correct_answers,
                        completed_at: rd.completed_at,
                    };
                }
            }
            setResults(resultMap);

            const assignedIds = enriched.filter((a) => a.status === "assigned").map((a) => a.id);
            if (assignedIds.length > 0) {
                markPlacementAssignmentsSeen(assignedIds);
            }
        } catch (err) {
            toast.error("Ошибка загрузки", { description: String(err) });
        } finally {
            setLoading(false);
        }
    }, [user, toast]);

    useEffect(() => { load(); }, [load]);

    const getStatusLabel = (status: string) => {
        switch (status) {
            case "assigned":
                return { text: "Назначен", icon: AlertCircle, color: "text-amber-600" };
            case "in_progress":
                return { text: "В процессе", icon: Play, color: "text-blue-600" };
            case "completed":
                return { text: "Пройден", icon: CheckCircle2, color: "text-emerald-600" };
            default:
                return { text: status, icon: AlertCircle, color: "text-muted-foreground" };
        }
    };

    const fmtDate = (d: string) => new Date(d).toLocaleString("ru-RU");

    if (!user) return null;

    return (
        <div className="flex flex-col gap-10">
            <section>
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-[hsl(var(--brand-blue-soft))]">
                        <ClipboardList className="h-5 w-5 text-[hsl(var(--brand-blue))]" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Placement</h1>
                        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                            Ваши вступительные тесты. Нажмите «Начать» чтобы пройти назначенный тест.
                        </p>
                    </div>
                </div>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-28 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : assignments.length === 0 ? (
                    <div className="rounded-3xl border border-border bg-card p-12 text-center shadow-sm">
                        <div className="flex flex-col items-center justify-center gap-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                                <AlertCircle className="h-7 w-7 text-muted-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground">Ожидайте назначения</h2>
                            <p className="max-w-sm text-sm text-muted-foreground">
                                Администратор ещё не назначил вам Placement-тест.
                                Когда тест появится, вы сразу получите уведомление.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {assignments.map((a) => {
                            const statusInfo = getStatusLabel(a.status);
                            const Icon = statusInfo.icon;
                            const result = results[a.id];
                            const isCompleted = a.status === "completed";
                            const isAssigned = a.status === "assigned";
                            const isInProgress = a.status === "in_progress";

                            return (
                                <div
                                    key={a.id}
                                    className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:bg-muted/40"
                                >
                                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="truncate font-semibold text-foreground">{a.test_title}</p>
                                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusInfo.color}`}>
                                                    <Icon size={10} />
                                                    {statusInfo.text}
                                                </span>
                                            </div>

                                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock size={11} />
                                                    Дата назначения: {fmtDate(a.assigned_at)}
                                                </span>
                                                {a.timeLimitMinutes && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Clock size={11} />
                                                        Время: {a.timeLimitMinutes} мин
                                                    </span>
                                                )}
                                                {a.passingScore > 0 && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <AlertCircle size={11} />
                                                        Проходной: {a.passingScore}%
                                                    </span>
                                                )}
                                            </div>

                                            {isCompleted && result && (
                                                <div className="mt-2 text-xs text-muted-foreground">
                                                    <span className="font-semibold text-foreground">{result.percentage}%</span> — {result.score}/{result.total} правильных • {fmtDate(result.completed_at)}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            {isAssigned || isInProgress ? (
                                                <button
                                                    onClick={() => router.push(`/placement/${a.id}`)}
                                                    className="inline-flex items-center gap-2 rounded-2xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
                                                >
                                                    <Play size={16} />
                                                    {isAssigned ? "Начать" : "Продолжить"}
                                                </button>
                                            ) : isCompleted ? (
                                                <button
                                                    onClick={() => router.push(`/placement/${a.id}`)}
                                                    className="inline-flex items-center gap-2 rounded-2xl border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted transition-colors"
                                                >
                                                    <CheckCircle2 size={16} />
                                                    Результат
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
