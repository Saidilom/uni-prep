"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Lock, CheckCircle2, Play } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { fetchAvailableMockTests, fetchUserMockAccess, userHasMockAccess, MockTest, MockAccess } from "@/lib/registan-utils";
import supabase from "@/lib/supabase/client";
import Link from "next/link";

export default function MockCatalogPage() {
    const { user } = useAuthStore();
    const router = useRouter();
    const [tests, setTests] = useState<MockTest[]>([]);
    const [accessList, setAccessList] = useState<MockAccess[]>([]);
    const [results, setResults] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [buyingId, setBuyingId] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        (async () => {
            setLoading(true);
            const [allTests, userAccess, { data: allResults }] = await Promise.all([
                fetchAvailableMockTests(),
                fetchUserMockAccess(user.id),
                supabase.from("mock_results").select("mock_test_id").eq("user_id", user.id),
            ]);
            setTests(allTests);
            setAccessList(userAccess);
            setResults(new Set((allResults?.map((r) => r.mock_test_id) || [])));
            setLoading(false);
        })();
    }, [user]);

    const getStatus = (test: MockTest) => {
        if (results.has(test.id)) return "completed";
        if (user && userHasMockAccess(user, test, accessList)) return "available";
        return "locked";
    };

    const handleBuy = async (testId: string) => {
        setBuyingId(testId);
        try {
            const res = await fetch("/api/payments/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mockTestId: testId }),
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.error || "Не удалось начать оплату");
                return;
            }
            router.push(`/mock/pay/${data.paymentId}`);
        } catch {
            alert("Не удалось начать оплату");
        } finally {
            setBuyingId(null);
        }
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
                                        <p className="mt-1 text-xs text-muted-foreground">{test.type === "paid" ? `Платный • ${test.price} UZS` : "Бесплатный"} • {test.durationMinutes ?? 0} мин</p>
                                    </div>
                                    {status === "locked" && test.type === "paid" ? (
                                        <button
                                            onClick={() => handleBuy(test.id)}
                                            disabled={buyingId === test.id}
                                            className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                                        >
                                            {buyingId === test.id ? "Открытие оплаты…" : "Купить"}
                                        </button>
                                    ) : status === "locked" ? (
                                        <span className="shrink-0 rounded-2xl border border-border bg-muted px-5 py-2.5 text-center text-sm font-semibold text-muted-foreground">
                                            Только для учеников Registan
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
        </div>
    );
}
