"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Check, ArrowRight, Lock, Play, Calendar, Trophy, CheckCircle2, ClipboardList, GraduationCap, Crown } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { fetchAvailableMockTests, fetchUserMockAccess, fetchUserClassMockAccess, fetchUserMockResults, fetchHasPlacementResult, userHasMockAccess, MockTest, MockAccess, MockResultRow } from "@/lib/registan-utils";
import { pageCache } from "@/lib/page-cache";
import { accuracyColor } from "@/lib/status-colors";
import PaymentModal from "@/components/payment-modal";
import TeacherHome from "@/components/teacher-home";
import LandingView from "@/components/landing";

type ResultRow = MockResultRow;

export default function HomePage() {
    const { user } = useAuthStore();
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(true);
    const [tests, setTests] = useState<MockTest[]>([]);
    const [accessList, setAccessList] = useState<MockAccess[]>([]);
    const [classAccessIds, setClassAccessIds] = useState<Set<string>>(new Set());
    const [results, setResults] = useState<ResultRow[]>([]);
    const [hasPlacementResult, setHasPlacementResult] = useState<boolean | null>(null);
    const [payingFor, setPayingFor] = useState<MockTest | null>(null);

    const load = async () => {
        if (!user) return;
        setLoading(true);
        const [allTests, userAccess, classAccess, resultsRes, hasPlacement] = await Promise.all([
            fetchAvailableMockTests(),
            fetchUserMockAccess(user.id),
            fetchUserClassMockAccess(user.id),
            fetchUserMockResults(user.id),
            fetchHasPlacementResult(user.id),
        ]);
        setTests(allTests);
        setAccessList(userAccess);
        setClassAccessIds(classAccess);
        setResults(resultsRes);
        setHasPlacementResult(hasPlacement);
        setLoading(false);
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const copyStudentId = () => {
        if (!user) return;
        navigator.clipboard.writeText(user.shortId || user.id);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const completedIds = new Set(results.map((r) => r.mock_test_id));
    const getStatus = (test: MockTest) => {
        if (completedIds.has(test.id)) return "completed" as const;
        if (user && userHasMockAccess(user, test, accessList, classAccessIds)) return "available" as const;
        return "locked" as const;
    };
    const duration = (test: MockTest) => (test as unknown as { duration_minutes?: number }).duration_minutes ?? test.durationMinutes ?? 0;

    const premiumTests = tests.filter((t) => t.type === "paid").slice(0, 3);
    // "free" tests are shown even when locked, as a Registan-membership upsell.
    // class_only tests have no such upsell — only show ones actually assigned
    // to this student (individually or via their class), otherwise every
    // teacher's class test in the system would clutter this widget.
    // Already-completed tests are excluded — this widget is for freshly
    // assigned tests, not a place to relaunch ones already taken.
    const freeTests = tests
        .filter((t) => (t.type === "free" || (t.type === "class_only" && classAccessIds.has(t.id))) && !completedIds.has(t.id))
        .slice(0, 4);
    const recentResults = results.slice(0, 3);
    // `score` is raw points earned (sum of question.points), not a percentage —
    // `accuracy` is the pre-computed correct/total percentage from submit_mock.
    const avgScore = results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.accuracy, 0) / results.length) : null;

    if (!user) return <LandingView />;
    if (user.role === "teacher") return <TeacherHome />;

    return (
        <div className="flex flex-col gap-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Greeting */}
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    Готовы поднять уровень, <span className="font-medium text-muted-foreground">{user.name?.trim()}</span>?
                </h1>
                <p className="mt-2 max-w-xl text-sm font-normal leading-relaxed text-muted-foreground">
                    {hasPlacementResult
                        ? "Продолжайте готовиться — ниже ваши Mock-тесты и последние результаты."
                        : "Пройдите вступительный тест, чтобы определить сильные стороны и получить план подготовки."}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                    {!hasPlacementResult ? (
                        <Link
                            href="/placement"
                            className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--brand-blue-ink))] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
                        >
                            Пройти вступительный тест
                            <ArrowRight size={16} />
                        </Link>
                    ) : null}
                    <button
                        type="button"
                        onClick={copyStudentId}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 font-mono text-sm font-medium tracking-wide text-foreground transition-colors hover:bg-muted"
                    >
                        {user.shortId || user.id}
                        {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} className="text-muted-foreground" />}
                    </button>
                </div>
            </section>

            {/* Analytics — same numbers as before, laid out as one stat row */}
            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-border">
                    <div className="bg-[hsl(var(--brand-blue-ink))] p-6">
                        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white">
                            <Trophy size={20} strokeWidth={1.75} />
                        </div>
                        <p className="text-xs text-white/70">Средний балл</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{avgScore !== null ? `${avgScore}%` : "—"}</p>
                    </div>
                    <div className="p-6">
                        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                            <CheckCircle2 size={20} strokeWidth={1.75} />
                        </div>
                        <p className="text-xs text-muted-foreground">Пройдено тестов</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{results.length}</p>
                    </div>
                    <div className="p-6">
                        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                            <ClipboardList size={20} strokeWidth={1.75} />
                        </div>
                        <p className="text-xs text-muted-foreground">Доступно тестов</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{tests.length}</p>
                    </div>
                    <div className="p-6">
                        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                            <GraduationCap size={20} strokeWidth={1.75} />
                        </div>
                        <p className="text-xs text-muted-foreground">Вступительный тест</p>
                        <p className={`mt-1 text-2xl font-semibold ${hasPlacementResult ? "text-emerald-600" : "text-foreground"}`}>
                            {hasPlacementResult ? "Пройден" : "Не пройден"}
                        </p>
                    </div>
                </div>
            </section>

            {/* Premium Mocks */}
            <section>
                <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-xl font-bold tracking-tight sm:text-2xl text-[hsl(var(--brand-blue-ink))]">Premium Mocks</h2>
                    <Link href="/mock" className="text-sm font-semibold text-[hsl(var(--brand-blue-ink))] hover:underline">
                        Все тесты
                    </Link>
                </div>
                {loading ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-40 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : premiumTests.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-8 text-center dark:bg-muted/30">
                        <p className="text-sm font-medium text-muted-foreground">Пока нет платных Mock-тестов.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {premiumTests.map((test) => {
                            const status = getStatus(test);
                            return (
                                <div key={test.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:bg-muted/40">
                                    <div>
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--brand-olive-soft))] text-[hsl(var(--brand-olive-ink))]">
                                                <Crown size={16} />
                                            </div>
                                            <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-600 dark:bg-red-950/40 dark:text-red-300">
                                                {test.price.toLocaleString()} UZS
                                            </span>
                                        </div>
                                        <p className="mt-3 font-semibold text-foreground">{test.title}</p>
                                        {test.description ? (
                                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{test.description}</p>
                                        ) : null}
                                        <p className="mt-2 text-xs text-muted-foreground">{duration(test)} мин</p>
                                    </div>
                                    {status === "locked" ? (
                                        <button
                                            onClick={() => setPayingFor(test)}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 active:scale-[0.97]"
                                        >
                                            Enroll
                                        </button>
                                    ) : (
                                        <Link
                                            href={`/mock/${test.id}`}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--brand-blue-ink))] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
                                        >
                                            {status === "completed" ? "Повторить" : "Начать"}
                                        </Link>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Available mocks + Recent results */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div>
                    <div className="mb-5 flex items-center justify-between">
                        <h2 className="text-xl font-bold tracking-tight sm:text-2xl text-[hsl(var(--brand-blue-ink))]">Доступные Mock-тесты</h2>
                    </div>
                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2].map((n) => (
                                <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />
                            ))}
                        </div>
                    ) : freeTests.length === 0 ? (
                        <div className="rounded-2xl border border-border bg-muted/50 py-8 text-center dark:bg-muted/30">
                            <p className="text-sm font-medium text-muted-foreground">Пока нет доступных Mock-тестов.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {freeTests.map((test) => {
                                const status = getStatus(test);
                                return (
                                    <div key={test.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:bg-muted/40">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))] text-white">
                                            <Play size={15} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-foreground">{test.title}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">{duration(test)} мин</p>
                                        </div>
                                        {status === "locked" ? (
                                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[hsl(var(--brand-olive-soft))] px-3 py-2 text-xs font-semibold text-[hsl(var(--brand-olive-ink))]">
                                                <Lock size={13} />
                                                Registan
                                            </span>
                                        ) : (
                                            <Link
                                                href={`/mock/${test.id}`}
                                                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[hsl(var(--brand-blue-ink))] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
                                            >
                                                <Play size={13} />
                                                Начать
                                            </Link>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div>
                    <div className="mb-5 flex items-center justify-between">
                        <h2 className="text-xl font-bold tracking-tight sm:text-2xl text-[hsl(var(--brand-blue-ink))]">Последние результаты</h2>
                        {results.length > 0 ? (
                            <Link href="/results" className="text-sm font-semibold text-[hsl(var(--brand-blue-ink))] hover:underline">
                                Вся история
                            </Link>
                        ) : null}
                    </div>
                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2].map((n) => (
                                <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />
                            ))}
                        </div>
                    ) : recentResults.length === 0 ? (
                        <div className="rounded-2xl border border-border bg-muted/50 py-8 text-center dark:bg-muted/30">
                            <p className="text-sm font-medium text-muted-foreground">Результаты появятся здесь после первого теста.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {recentResults.map((r) => (
                                <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">{r.mock_test_title}</p>
                                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                            <Calendar size={11} />
                                            {new Date(r.completed_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-bold tabular-nums ${accuracyColor(r.accuracy)}`}>
                                        {r.accuracy}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {payingFor ? (
                <PaymentModal
                    mockTestId={payingFor.id}
                    title={payingFor.title}
                    price={payingFor.price}
                    onClose={() => setPayingFor(null)}
                    onSuccess={() => {
                        setPayingFor(null);
                        if (user) pageCache.invalidate(`mockAccess:${user.id}`);
                        load();
                    }}
                />
            ) : null}
        </div>
    );
}
