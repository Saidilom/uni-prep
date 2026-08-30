"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchAdminOverview } from "@/lib/admin-utils";
import { GraduationCap, Wallet, Clock, CreditCard, ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

type Overview = Awaited<ReturnType<typeof fetchAdminOverview>>;

export default function AdminDashboard() {
    const [overview, setOverview] = useState<Overview | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { locale } = useLocale();
    const t = useTranslations("adminHome");

    const statusLabel: Record<string, { text: string; className: string }> = {
        success: { text: t("statusSuccess"), className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" },
        failed: { text: t("statusFailed"), className: "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40" },
        pending: { text: t("statusPending"), className: "border-border bg-muted text-muted-foreground" },
    };

    useEffect(() => {
        fetchAdminOverview().then((data) => {
            setOverview(data);
            setIsLoading(false);
        });
    }, []);

    const statCards = [
        { label: t("revenueLabel"), value: overview?.revenue?.toLocaleString(), icon: Wallet },
        { label: t("totalStudentsLabel"), value: overview?.students, icon: GraduationCap },
        { label: t("waitingForMockLabel"), value: overview?.waitingForMock, icon: Clock },
    ];

    return (
        <div className="flex flex-col gap-12">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("overviewTitle")}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t("overviewSubtitle")}
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
                            <CreditCard size={19} className="text-muted-foreground" /> {t("recentTransactionsTitle")}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">{t("recentTransactionsSubtitle")}</p>
                    </div>
                    <Link href="/admin/payments" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--brand-blue-ink))] hover:underline">
                        {t("allPayments")} <ArrowRight size={14} />
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
                        <p className="font-medium text-muted-foreground">{t("noTransactionsYet")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {overview.recentTransactions.map((tx) => {
                            const status = statusLabel[tx.status] ?? statusLabel.pending;
                            return (
                                <div key={tx.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">{tx.userName}</p>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{tx.mockTestTitle} • {new Date(tx.createdAt).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ")}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <p className="text-sm font-bold tabular-nums text-foreground">{tx.amount.toLocaleString()} {tx.currency}</p>
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
