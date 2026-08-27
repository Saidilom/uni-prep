"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Check, Trophy, ArrowRight, Lock, Play, Calendar } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { fetchAvailableMockTests, fetchUserMockAccess, fetchUserClassMockAccess, fetchUserMockResults, fetchHasPlacementResult, userHasMockAccess, MockTest, MockAccess, MockResultRow } from "@/lib/registan-utils";
import { pageCache } from "@/lib/page-cache";
import PaymentModal from "@/components/payment-modal";
import TeacherHome from "@/components/teacher-home";

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

    if (!user) return null;
    if (user.role === "teacher") return <TeacherHome />;

    return (
        <div className="flex flex-col gap-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Greeting + current standing */}
            <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white shadow-sm lg:col-span-2">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 opacity-[0.12]"
                        style={{
                            backgroundImage: "radial-gradient(circle, white 1.5px, transparent 1.5px)",
                            backgroundSize: "18px 18px",
                        }}
                    />
                    <div className="relative">
                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                            Готовы поднять уровень, {user.name}?
                        </h1>
                        <p className="mt-2 max-w-md text-sm leading-relaxed text-blue-100">
                            {hasPlacementResult
                                ? "Продолжайте готовиться — ниже ваши Mock-тесты и последние результаты."
                                : "Пройдите вступительный тест, чтобы определить сильные стороны и получить план подготовки."}
                        </p>
                        <div className="mt-6 flex flex-wrap items-center gap-3">
                            {!hasPlacementResult ? (
                                <Link
                                    href="/placement"
                                    className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-blue-700 shadow-sm transition-all hover:bg-blue-50 active:scale-[0.97]"
                                >
                                    Пройти вступительный тест
                                    <ArrowRight size={16} />
                                </Link>
                            ) : null}
                            <button
                                type="button"
                                onClick={copyStudentId}
                                className="inline-flex items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 py-3 font-mono text-sm font-bold tracking-wide text-white transition-colors hover:bg-white/15"
                            >
                                {user.shortId || user.id}
                                {copied ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} className="text-blue-100" />}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col justify-between rounded-3xl border border-border bg-card p-6 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Текущий результат</p>
                    {avgScore !== null ? (
                        <>
                            <p className="mt-2 text-4xl font-extrabold tabular-nums text-foreground">
                                {avgScore}
                                <span className="text-lg font-semibold text-muted-foreground">%</span>
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">Средний балл по всем Mock-тестам</p>
                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${avgScore}%` }} />
                            </div>
                        </>
                    ) : (
                        <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-2 py-2 text-center">
                            <Trophy size={26} className="text-muted-foreground/40" />
                            <p className="text-xs text-muted-foreground">Пройдите первый Mock-тест, чтобы увидеть статистику</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Premium Mocks */}
            <section>
                <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Premium Mocks</h2>
                    <Link href="/mock" className="text-sm font-semibold text-blue-600 hover:underline">
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
                                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                                            {test.price.toLocaleString()} UZS
                                        </span>
                                        <p className="mt-3 font-semibold text-foreground">{test.title}</p>
                                        {test.description ? (
                                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{test.description}</p>
                                        ) : null}
                                        <p className="mt-2 text-xs text-muted-foreground">{duration(test)} мин</p>
                                    </div>
                                    {status === "locked" ? (
                                        <button
                                            onClick={() => setPayingFor(test)}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-[0.97]"
                                        >
                                            Enroll
                                        </button>
                                    ) : (
                                        <Link
                                            href={`/mock/${test.id}`}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
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
                        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Доступные Mock-тесты</h2>
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
                                    <div key={test.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:bg-muted/40">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-foreground">{test.title}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">{duration(test)} мин</p>
                                        </div>
                                        {status === "locked" ? (
                                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
                                                <Lock size={13} />
                                                Registan
                                            </span>
                                        ) : (
                                            <Link
                                                href={`/mock/${test.id}`}
                                                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-xs font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
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
                        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Последние результаты</h2>
                        {results.length > 0 ? (
                            <Link href="/results" className="text-sm font-semibold text-blue-600 hover:underline">
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
                                    <span className="shrink-0 rounded-xl bg-muted px-3 py-1.5 text-sm font-extrabold tabular-nums text-foreground">
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
