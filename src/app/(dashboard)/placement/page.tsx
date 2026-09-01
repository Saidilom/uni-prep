"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Play, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/useToast";
import { fetchUserPlacementAssignments } from "@/lib/registan-utils";
import { markPlacementAssignmentsSeen } from "@/hooks/usePlacementNotifications";
import { pageCache } from "@/lib/page-cache";
import supabase from "@/lib/supabase/client";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

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
    timeLimitMinutes?: number | null;
    questionCount: number;
};

type StatusTab = "assigned" | "in_progress" | "completed";
const STATUS_TAB_IDS: StatusTab[] = ["assigned", "in_progress", "completed"];

type ResultSummary = {
    percentage: number;
    score: number;
    total: number;
    correct_answers: number;
    completed_at: string;
};

export default function PlacementPage() {
    const { user } = useAuthStore();
    const { locale } = useLocale();
    const t = useTranslations("placementList");
    const toast = useToast();
    const router = useRouter();
    const STATUS_TABS: Array<{ id: StatusTab; label: string }> = [
        { id: "assigned", label: t("tabNew") },
        { id: "in_progress", label: t("tabInProgress") },
        { id: "completed", label: t("tabCompleted") },
    ];
    const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
    const [results, setResults] = useState<Record<string, ResultSummary>>({});
    const [loading, setLoading] = useState(true);
    // null until the first successful load picks a sensible starting tab
    // (whichever status actually has assignments) — kept afterwards so a
    // background refresh (e.g. after ensureActiveAssignment) never yanks the
    // student back to a different tab than the one they're looking at.
    const [activeTab, setActiveTab] = useState<StatusTab | null>(null);

    // No one assigns "Школа" to a student anymore — whichever test the admin
    // marked active (set_active_placement_test) is open to everyone. The
    // first visit self-assigns into it (RLS lets a student insert their own
    // placement_assignments row), so scanning the reception QR and signing
    // up leads straight to "Начать" with no admin step in between.
    const ensureActiveAssignment = useCallback(async () => {
        if (!user) return;
        // More than one placement_tests row can be is_active=true (admin no
        // longer has a single-active constraint) — pick the most recently
        // activated one deterministically instead of .maybeSingle(), which
        // would silently error out (and skip self-assignment entirely) the
        // moment a second test gets activated.
        const { data: activeTests } = await supabase
            .from("placement_tests")
            .select("id, title")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(1);
        const activeTest = activeTests?.[0];
        if (!activeTest) return;

        // A plain SELECT-then-INSERT here used to race — two near-simultaneous
        // calls (e.g. React's dev-mode double effect invocation, or just two
        // tabs) could both see "not assigned yet" and both insert, and once a
        // duplicate existed .maybeSingle() found "more than one row" and read
        // that the same as "none", so every later visit added yet another
        // duplicate forever. The unique (user_id, test_id) constraint plus
        // an upsert makes this atomic and idempotent instead.
        await supabase.from("placement_assignments").upsert(
            {
                id: crypto.randomUUID(),
                user_id: user.id,
                test_id: activeTest.id,
                test_title: activeTest.title,
                status: "assigned",
                assigned_by: user.id,
            },
            { onConflict: "user_id,test_id", ignoreDuplicates: true }
        );
    }, [user]);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            await ensureActiveAssignment();
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

            const testMap: Record<string, { durationMinutes: number; questionCount: number }> = {};
            await Promise.all(
                Array.from(testIds).map(async (tid) => {
                    const [{ data: td }, { count }] = await Promise.all([
                        supabase.from("placement_tests").select("time_limit_minutes").eq("id", tid).single(),
                        supabase.from("placement_questions").select("id", { count: "exact", head: true }).eq("test_id", tid),
                    ]);
                    testMap[tid] = {
                        durationMinutes: Number(td?.time_limit_minutes ?? 0),
                        questionCount: count ?? 0,
                    };
                })
            );

            for (const a of data) {
                const test = testMap[a.test_id];
                enriched.push({
                    ...a,
                    timeLimitMinutes: test?.durationMinutes ?? null,
                    questionCount: test?.questionCount || 0,
                });
            }

            setAssignments(enriched);
            setActiveTab((current) => {
                if (current) return current;
                const firstNonEmpty = STATUS_TAB_IDS.find((tabId) => enriched.some((a) => a.status === tabId));
                return firstNonEmpty ?? "assigned";
            });

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
            toast.error(t("loadError"), { description: String(err) });
        } finally {
            setLoading(false);
        }
    }, [user, toast, ensureActiveAssignment, t]);

    useEffect(() => { load(); }, [load]);

    const getStatusLabel = (status: string) => {
        switch (status) {
            case "assigned":
                return { text: t("statusAssigned"), icon: AlertCircle, color: "text-amber-600" };
            case "in_progress":
                return { text: t("statusInProgress"), icon: Play, color: "text-primary" };
            case "completed":
                return { text: t("statusCompleted"), icon: CheckCircle2, color: "text-emerald-600" };
            default:
                return { text: status, icon: AlertCircle, color: "text-muted-foreground" };
        }
    };

    const fmtDate = (d: string) => new Date(d).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ");

    if (!user) return null;

    const tabCount = (tab: StatusTab) => assignments.filter((a) => a.status === tab).length;
    const visibleAssignments = activeTab ? assignments.filter((a) => a.status === activeTab) : [];

    return (
        <div className="flex flex-col gap-8">
            <section className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-[hsl(var(--brand-blue-soft))]">
                        <ClipboardList className="h-5 w-5 text-[hsl(var(--brand-blue))]" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                            {t("subtitle")}
                        </p>
                    </div>
                </div>

                {assignments.length > 0 && (
                    <div className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border bg-card p-1">
                        {STATUS_TABS.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                                    activeTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                            >
                                {tab.label}
                                <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums ${activeTab === tab.id ? "bg-primary-foreground/20" : "bg-muted"}`}>
                                    {tabCount(tab.id)}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </section>

            <section>
                {loading ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {[1, 2].map((n) => (
                            <div key={n} className="h-56 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : assignments.length === 0 ? (
                    <div className="rounded-3xl border border-border bg-card p-12 text-center shadow-sm">
                        <div className="flex flex-col items-center justify-center gap-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                                <AlertCircle className="h-7 w-7 text-muted-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground">{t("testUnavailableTitle")}</h2>
                            <p className="max-w-sm text-sm text-muted-foreground">
                                {t("testUnavailableBody")}
                            </p>
                        </div>
                    </div>
                ) : visibleAssignments.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">
                            {t("noTestsInStatus").replace("{status}", STATUS_TABS.find((tab) => tab.id === activeTab)?.label ?? "")}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {visibleAssignments.map((a) => {
                            const statusInfo = getStatusLabel(a.status);
                            const Icon = statusInfo.icon;
                            const result = results[a.id];
                            const isCompleted = a.status === "completed";
                            const isAssigned = a.status === "assigned";
                            const isInProgress = a.status === "in_progress";
                            // We only track a single status per assignment, not
                            // per-question progress — so the bar is qualitative
                            // (empty/half/full), not a measured fraction.
                            const progressWidth = isCompleted ? "100%" : isInProgress ? "50%" : "6%";

                            return (
                                <div
                                    key={a.id}
                                    className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:bg-muted/40"
                                >
                                    <div>
                                        <p className="truncate text-lg font-bold text-foreground">{a.test_title}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{t("assignedOn").replace("{date}", fmtDate(a.assigned_at))}</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("questionsLabel")}</p>
                                            <p className="mt-1 text-xl font-extrabold tabular-nums text-foreground">{a.questionCount || "—"}</p>
                                        </div>
                                        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("timeLabel")}</p>
                                            <p className="mt-1 text-xl font-extrabold tabular-nums text-foreground">{a.timeLimitMinutes ? `${a.timeLimitMinutes} ${t("minutesSuffix")}` : "—"}</p>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-sm font-semibold text-foreground">
                                                {isCompleted && result ? `${result.percentage}%` : statusInfo.text}
                                            </span>
                                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusInfo.color}`}>
                                                <Icon size={10} />
                                                {statusInfo.text}
                                            </span>
                                        </div>
                                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: progressWidth }} />
                                        </div>
                                        {isCompleted && result && (
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                {t("correctOf").replace("{score}", String(result.score)).replace("{total}", String(result.total)).replace("{date}", fmtDate(result.completed_at))}
                                            </p>
                                        )}
                                    </div>

                                    {isAssigned || isInProgress ? (
                                        <button
                                            onClick={() => router.push(`/placement/${a.id}`)}
                                            className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
                                        >
                                            <Play size={16} />
                                            {isAssigned ? t("start") : t("continueLabel")}
                                        </button>
                                    ) : isCompleted ? (
                                        <button
                                            onClick={() => router.push(`/placement/${a.id}`)}
                                            className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-bold hover:bg-muted transition-colors"
                                        >
                                            <CheckCircle2 size={16} />
                                            {t("result")}
                                        </button>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
