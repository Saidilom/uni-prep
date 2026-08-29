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
        { label: "Доход (UZS)", value: overview?.revenue?.toLocaleString(), icon: Wallet },
        { label: "Учеников всего", value: overview?.students, icon: GraduationCap },
        { label: "Оплатили и ждут тест", value: overview?.waitingForMock, icon: Clock },
    ];

    return (
        <div className="flex flex-col gap-12">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Обзор системы</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Деньги и ученики платформы в реальном времени.
                </p>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                {isLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x sm:divide-border">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-28 animate-pulse bg-muted" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x sm:divide-border">
                        {statCards.map((card, idx) => (
                            <div key={idx} className="p-6">
                                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                                    <card.icon size={20} strokeWidth={1.75} />
                                </div>
                                <p className="text-xs text-muted-foreground">{card.label}</p>
                                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{card.value ?? 0}</p>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-8">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-[hsl(var(--brand-blue-ink))]">
                            <CreditCard size={19} className="text-muted-foreground" /> Недавние транзакции
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">Последние оплаты платных Mock-тестов.</p>
                    </div>
                    <Link href="/admin/payments" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--brand-blue-ink))] hover:underline">
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
