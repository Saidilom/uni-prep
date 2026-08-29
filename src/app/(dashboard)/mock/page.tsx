"use client";

import { useEffect, useState } from "react";
import { BookOpen, Lock, CheckCircle2, Play, Users, GraduationCap } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { fetchAvailableMockTests, fetchUserMockAccess, fetchUserClassMockAccess, fetchUserMockResults, userHasMockAccess, MockTest, MockAccess } from "@/lib/registan-utils";
import { fetchTeacherMockAssignmentsSummary, TeacherMockAssignmentSummary } from "@/lib/class-utils";
import { pageCache } from "@/lib/page-cache";
import { MOCK_STATUS_COLOR } from "@/lib/status-colors";
import Link from "next/link";
import PaymentModal from "@/components/payment-modal";

type TeacherTestRow = { id: string; title: string; duration_minutes: number; status: string };

function TeacherMockAssignments() {
    const { user } = useAuthStore();
    const [tests, setTests] = useState<TeacherTestRow[]>([]);
    const [summary, setSummary] = useState<Record<string, TeacherMockAssignmentSummary>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        (async () => {
            setLoading(true);
            const response = await fetch("/api/mock-tests", { cache: "no-store" });
            const body = await response.json().catch(() => ({}));
            const rows = (response.ok ? body.tests || [] : []) as TeacherTestRow[];
            setTests(rows);
            setSummary(await fetchTeacherMockAssignmentsSummary(user.id, rows.map((t) => t.id)));
            setLoading(false);
        })();
    }, [user]);

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Mock-тесты</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Кому назначен каждый из ваших тестов — группам и/или отдельным ученикам.
                </p>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-32 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : tests.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">У вас пока нет Mock-тестов. Создайте один на странице «Мои тесты».</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {tests.map((test) => {
                            const s = summary[test.id] || { classes: [], students: [] };
                            return (
                                <div key={test.id} className="rounded-2xl border border-border bg-card p-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="truncate font-semibold text-foreground">{test.title}</p>
                                        <span className="shrink-0 text-xs text-muted-foreground">{test.duration_minutes} мин</span>
                                    </div>
                                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div>
                                            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                <GraduationCap size={12} /> Группам
                                            </p>
                                            {s.classes.length === 0 ? (
                                                <p className="text-xs text-muted-foreground">Не назначен</p>
                                            ) : (
                                                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
                                                    {s.classes.map((c) => (
                                                        <span key={c.id} className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">{c.name}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                <Users size={12} /> Ученикам
                                            </p>
                                            {s.students.length === 0 ? (
                                                <p className="text-xs text-muted-foreground">Не назначен</p>
                                            ) : (
                                                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
                                                    {s.students.map((st) => (
                                                        <span key={st.id} className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">{st.name}</span>
                                                    ))}
                                                </div>
                                            )}
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

function StudentMockCatalog() {
    const { user } = useAuthStore();
    const [tests, setTests] = useState<MockTest[]>([]);
    const [accessList, setAccessList] = useState<MockAccess[]>([]);
    const [classAccessIds, setClassAccessIds] = useState<Set<string>>(new Set());
    const [results, setResults] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [payingFor, setPayingFor] = useState<MockTest | null>(null);

    const load = async () => {
        if (!user) return;
        setLoading(true);
        const [allTests, userAccess, classAccess, allResults] = await Promise.all([
            fetchAvailableMockTests(),
            fetchUserMockAccess(user.id),
            fetchUserClassMockAccess(user.id),
            fetchUserMockResults(user.id),
        ]);
        setTests(allTests);
        setAccessList(userAccess);
        setClassAccessIds(classAccess);
        setResults(new Set(allResults.map((r) => r.mock_test_id)));
        setLoading(false);
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const getStatus = (test: MockTest) => {
        if (results.has(test.id)) return "completed";
        if (user && userHasMockAccess(user, test, accessList, classAccessIds)) return "available";
        return "locked";
    };

    // Only show tests this student could actually ever unlock: paid tests are
    // always actionable (they can buy access), and already-completed ones
    // stay visible for review — but a "free" test gated to Registan students
    // when this student isn't one, or a class_only test not assigned to
    // their class, can never become available for them, so listing it as a
    // permanently "Заблокирован" row is just noise, not something for the
    // student to act on.
    const visibleTests = tests.filter((test) => {
        if (test.type === "paid") return true;
        if (results.has(test.id)) return true;
        if (test.type === "free") return user?.isRegistanStudent ?? false;
        if (test.type === "class_only") return classAccessIds.has(test.id);
        return true;
    });

    const statusLabel: Record<string, { text: string; icon: typeof BookOpen; color: string }> = {
        available: { text: "Доступен", icon: Play, color: MOCK_STATUS_COLOR.available },
        locked: { text: "Заблокирован", icon: Lock, color: MOCK_STATUS_COLOR.locked },
        completed: { text: "Пройден", icon: CheckCircle2, color: MOCK_STATUS_COLOR.completed },
    };

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Mock-тесты</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Официальные пробные экзамены. Пройдите тест и проверьте результат.
                </p>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-32 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : visibleTests.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">Нет доступных Mock-тестов.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {visibleTests.map((test) => {
                            const status = getStatus(test);
                            const StatusIcon = statusLabel[status].icon;
                            return (
                                <div
                                    key={test.id}
                                    className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-6 transition-all hover:bg-muted/40 sm:flex-row sm:items-center"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="truncate font-semibold text-foreground">{test.title}</p>
                                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusLabel[status].color}`}>
                                                <StatusIcon size={12} />
                                                {statusLabel[status].text}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-muted-foreground">{test.type === "paid" ? `Платный • ${test.price} UZS` : "Бесплатный"} • {(test as unknown as { duration_minutes?: number }).duration_minutes ?? test.durationMinutes ?? 0} мин</p>
                                    </div>
                                    {status === "locked" && test.type === "paid" ? (
                                        <button
                                            onClick={() => setPayingFor(test)}
                                            className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 active:scale-[0.97]"
                                        >
                                            Купить
                                        </button>
                                    ) : status === "locked" ? (
                                        <span className="shrink-0 rounded-xl border border-border bg-muted px-5 py-2.5 text-center text-sm font-semibold text-muted-foreground">
                                            {test.type === "class_only" ? "Доступно только вашей группе" : "Только для учеников Registan"}
                                        </span>
                                    ) : (
                                        <Link
                                            href={`/mock/${test.id}`}
                                            className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
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

export default function MockCatalogPage() {
    const { user } = useAuthStore();
    if (user?.role === "teacher") return <TeacherMockAssignments />;
    return <StudentMockCatalog />;
}
