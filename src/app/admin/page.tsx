"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchAdminOverview } from "@/lib/admin-utils";
import { GraduationCap, Wallet, Clock, CreditCard, ArrowRight } from "lucide-react";

type Overview = Awaited<ReturnType<typeof fetchAdminOverview>>;

const statusLabel: Record<string, { text: string; className: string }> = {
    success: { text: "Успешно", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" },
    failed: { text: "Ошибка", className: "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40" },
    pending: { text: "Ожидание", className: "border-border bg-muted text-muted-foreground" },
};

export default function AdminDashboard() {
    const [overview, setOverview] = useState<Overview | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchAdminOverview().then((data) => {
            setOverview(data);
            setIsLoading(false);
        });
    }, []);

    const statCards = [
        { label: "Доход (UZS)", value: overview?.revenue?.toLocaleString(), icon: Wallet, accent: "from-emerald-50 to-teal-50 text-emerald-600 dark:from-emerald-950/40 dark:to-teal-950/40" },
        { label: "Учеников всего", value: overview?.students, icon: GraduationCap, accent: "from-blue-50 to-indigo-50 text-blue-600 dark:from-blue-950/40 dark:to-indigo-950/40" },
        { label: "Оплатили и ждут тест", value: overview?.waitingForMock, icon: Clock, accent: "from-amber-50 to-orange-50 text-amber-600 dark:from-amber-950/40 dark:to-orange-950/40" },
    ];

    return (
        <div className="flex flex-col gap-12">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Обзор системы</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Деньги и ученики платформы в реальном времени.
                </p>
            </section>

            <section className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                {isLoading ? (
                    [1, 2, 3].map((i) => (
                        <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
                    ))
                ) : (
                    statCards.map((card, idx) => (
                        <div key={idx} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${card.accent}`}>
                                <card.icon size={22} />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-2xl font-extrabold tabular-nums text-foreground">{card.value ?? 0}</p>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</p>
                            </div>
                        </div>
                    ))
                )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-8">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
                            <CreditCard size={19} className="text-muted-foreground" /> Недавние транзакции
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">Последние оплаты платных Mock-тестов.</p>
                    </div>
                    <Link href="/admin/payments" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline">
                        Все оплаты <ArrowRight size={14} />
                    </Link>
                </div>

                {isLoading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : !overview || overview.recentTransactions.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">Пока нет транзакций.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {overview.recentTransactions.map((t) => {
                            const status = statusLabel[t.status] ?? statusLabel.pending;
                            return (
                                <div key={t.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">{t.userName}</p>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.mockTestTitle} • {new Date(t.createdAt).toLocaleString("ru-RU")}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <p className="text-sm font-bold tabular-nums text-foreground">{t.amount.toLocaleString()} {t.currency}</p>
                                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${status.className}`}>{status.text}</span>
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
