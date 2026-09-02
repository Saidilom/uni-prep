"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, CreditCard, Wallet, ChevronDown, List, LayoutGrid } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

type PaymentRow = {
    id: string;
    user_name: string;
    user_phone: string;
    mock_test_id: string | null;
    mock_test_title: string;
    amount: number;
    currency: string;
    status: string;
    provider: string;
    created_at: string;
    paid_at?: string;
};

type StatusFilter = "all" | "pending" | "success" | "failed";
type ViewMode = "list" | "byMock";

export default function AdminPaymentsPage() {
    const [payments, setPayments] = useState<PaymentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const { locale } = useLocale();
    const t = useTranslations("adminPayments");

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [view, setView] = useState<ViewMode>("list");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const load = async () => {
        setLoading(true);
        const { data } = await supabase.from("payments").select("*").order("created_at", { ascending: false });
        if (data) setPayments(data as PaymentRow[]);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const from = dateFrom ? new Date(dateFrom) : null;
        const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
        return payments.filter((p) => {
            if (statusFilter !== "all" && p.status !== statusFilter) return false;
            if (q && !p.user_name.toLowerCase().includes(q) && !p.user_phone.includes(q)) return false;
            const createdAt = new Date(p.created_at);
            if (from && createdAt < from) return false;
            if (to && createdAt > to) return false;
            return true;
        });
    }, [payments, search, statusFilter, dateFrom, dateTo]);

    const totalAmount = filtered.reduce((sum, p) => sum + (p.status === "success" ? p.amount : 0), 0);

    const mockGroups = useMemo(() => {
        const groups = new Map<string, { key: string; title: string; payments: PaymentRow[]; revenue: number; successCount: number }>();
        for (const p of filtered) {
            const key = p.mock_test_id ?? `title:${p.mock_test_title}`;
            let group = groups.get(key);
            if (!group) {
                group = { key, title: p.mock_test_title, payments: [], revenue: 0, successCount: 0 };
                groups.set(key, group);
            }
            group.payments.push(p);
            if (p.status === "success") {
                group.revenue += p.amount;
                group.successCount += 1;
            }
        }
        return Array.from(groups.values()).sort((a, b) => b.revenue - a.revenue);
    }, [filtered]);

    const toggleExpanded = (key: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t("subtitle")}
                </p>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-border">
                    <div className="p-6">
                        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                            <CreditCard size={20} strokeWidth={1.75} />
                        </div>
                        <p className="text-xs text-muted-foreground">{t("countLabel")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{filtered.length}</p>
                    </div>
                    <div className="p-6">
                        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                            <Wallet size={20} strokeWidth={1.75} />
                        </div>
                        <p className="text-xs text-muted-foreground">{t("sumLabel")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{totalAmount.toLocaleString()}</p>
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:flex-wrap">
                <div className="flex flex-1 items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 min-w-[200px]">
                    <Search size={16} className="text-muted-foreground shrink-0" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t("searchPlaceholder")}
                        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground"
                >
                    <option value="all">{t("statusAll")}</option>
                    <option value="pending">{t("statusPending")}</option>
                    <option value="success">{t("statusSuccess")}</option>
                    <option value="failed">{t("statusFailed")}</option>
                </select>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground"
                    />
                    <span className="text-xs text-muted-foreground">—</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground"
                    />
                </div>
                {(search || statusFilter !== "all" || dateFrom || dateTo) && (
                    <button
                        onClick={() => { setSearch(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}
                        className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
                    >
                        {t("reset")}
                    </button>
                )}
                <div className="flex items-center gap-1 rounded-2xl border border-border bg-background p-1 sm:ml-auto">
                    <button
                        onClick={() => setView("list")}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${view === "list" ? "bg-[hsl(var(--brand-blue-ink))] text-white" : "text-muted-foreground hover:bg-muted"}`}
                    >
                        <List size={15} /> {t("viewList")}
                    </button>
                    <button
                        onClick={() => setView("byMock")}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${view === "byMock" ? "bg-[hsl(var(--brand-blue-ink))] text-white" : "text-muted-foreground hover:bg-muted"}`}
                    >
                        <LayoutGrid size={15} /> {t("viewByMock")}
                    </button>
                </div>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-20 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">{payments.length === 0 ? t("noPaymentsYet") : t("noResultsForFilter")}</p>
                    </div>
                ) : view === "list" ? (
                    <div className="space-y-3">
                        {filtered.map((p) => (
                            <div key={p.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:bg-muted/40 sm:flex-row sm:items-center">
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-foreground">{p.user_name} {p.user_phone}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{p.mock_test_title} • {p.provider}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ")}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <p className="text-lg font-bold tabular-nums text-foreground">{p.amount.toLocaleString()} {p.currency}</p>
                                        <span className={`inline-block mt-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${p.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : p.status === "failed" ? "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40" : "border-border bg-muted text-muted-foreground"}`}>
                                            {p.status === "success" ? t("statusSuccess") : p.status === "failed" ? t("statusFailed") : t("statusPending")}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {mockGroups.map((group) => {
                            const isOpen = expanded.has(group.key);
                            return (
                                <div key={group.key} className="overflow-hidden rounded-2xl border border-border bg-card">
                                    <button
                                        onClick={() => toggleExpanded(group.key)}
                                        className="flex w-full flex-col justify-between gap-3 p-5 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-foreground">{group.title}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">{t("paymentsCountLabel").replace("{count}", String(group.payments.length))}</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <p className="text-lg font-bold tabular-nums text-foreground">{group.revenue.toLocaleString()} <span className="text-xs font-semibold text-muted-foreground">UZS</span></p>
                                            <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                        </div>
                                    </button>
                                    {isOpen && (
                                        <div className="space-y-2 border-t border-border bg-muted/20 p-4">
                                            {group.payments.map((p) => (
                                                <div key={p.id} className="flex flex-col justify-between gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-foreground">{p.user_name} {p.user_phone}</p>
                                                        <p className="mt-0.5 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ")}</p>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <p className="text-sm font-bold tabular-nums text-foreground">{p.amount.toLocaleString()} {p.currency}</p>
                                                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${p.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : p.status === "failed" ? "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40" : "border-border bg-muted text-muted-foreground"}`}>
                                                            {p.status === "success" ? t("statusSuccess") : p.status === "failed" ? t("statusFailed") : t("statusPending")}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
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
