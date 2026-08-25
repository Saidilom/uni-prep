"use client";

import { useEffect, useState } from "react";
import { BookOpen, Lock, CheckCircle2, Play } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { fetchAvailableMockTests, fetchUserMockAccess, fetchUserClassMockAccess, userHasMockAccess, MockTest, MockAccess } from "@/lib/registan-utils";
import supabase from "@/lib/supabase/client";
import Link from "next/link";
import PaymentModal from "@/components/payment-modal";

export default function MockCatalogPage() {
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
        const [allTests, userAccess, classAccess, { data: allResults }] = await Promise.all([
            fetchAvailableMockTests(),
            fetchUserMockAccess(user.id),
            fetchUserClassMockAccess(user.id),
            supabase.from("mock_results").select("mock_test_id").eq("user_id", user.id),
        ]);
        setTests(allTests);
        setAccessList(userAccess);
        setClassAccessIds(classAccess);
        setResults(new Set((allResults?.map((r) => r.mock_test_id) || [])));
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

    const statusLabel: Record<string, { text: string; icon: typeof BookOpen; color: string }> = {
        available: { text: "Доступен", icon: Play, color: "text-emerald-600" },
        locked: { text: "Заблокирован", icon: Lock, color: "text-red-600" },
        completed: { text: "Пройден", icon: CheckCircle2, color: "text-blue-600" },
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
                ) : tests.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">Нет доступных Mock-тестов.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {tests.map((test) => {
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
                                            className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
                                        >
                                            Купить
                                        </button>
                                    ) : status === "locked" ? (
                                        <span className="shrink-0 rounded-2xl border border-border bg-muted px-5 py-2.5 text-center text-sm font-semibold text-muted-foreground">
                                            {test.type === "class_only" ? "Доступно только вашему классу" : "Только для учеников Registan"}
                                        </span>
                                    ) : (
                                        <Link
                                            href={`/mock/${test.id}`}
                                            className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
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
                        load();
                    }}
                />
            ) : null}
        </div>
    );
}
