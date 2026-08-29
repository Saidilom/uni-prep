"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, CreditCard, Wallet } from "lucide-react";
import supabase from "@/lib/supabase/client";

type PaymentRow = {
    id: string;
    user_name: string;
    user_phone: string;
    mock_test_title: string;
    amount: number;
    currency: string;
    status: string;
    provider: string;
    created_at: string;
    paid_at?: string;
};

type StatusFilter = "all" | "pending" | "success" | "failed";

export default function AdminPaymentsPage() {
    const [payments, setPayments] = useState<PaymentRow[]>([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

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

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Оплаты</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    История оплат платных Mock-тестов.
                </p>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-border">
                    <div className="p-6">
                        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                            <CreditCard size={20} strokeWidth={1.75} />
                        </div>
                        <p className="text-xs text-muted-foreground">Оплат (по фильтру)</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{filtered.length}</p>
                    </div>
                    <div className="p-6">
                        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                            <Wallet size={20} strokeWidth={1.75} />
                        </div>
                        <p className="text-xs text-muted-foreground">Сумма (UZS)</p>
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
                        placeholder="Поиск по имени или телефону…"
                        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground"
                >
                    <option value="all">Все статусы</option>
                    <option value="pending">Ожидание</option>
                    <option value="success">Успешно</option>
                    <option value="failed">Ошибка</option>
                </select>
                <div className="flex items-center gap-2">
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
                        Сбросить
                    </button>
                )}
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
                        <p className="font-medium text-muted-foreground">{payments.length === 0 ? "Пока нет оплат." : "Ничего не найдено по фильтру."}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((p) => (
                            <div key={p.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:bg-muted/40 sm:flex-row sm:items-center">
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-foreground">{p.user_name} {p.user_phone}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{p.mock_test_title} • {p.provider}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("ru-RU")}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <p className="text-lg font-bold tabular-nums text-foreground">{p.amount.toLocaleString()} {p.currency}</p>
                                        <span className={`inline-block mt-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${p.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : p.status === "failed" ? "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40" : "border-border bg-muted text-muted-foreground"}`}>
                                            {p.status === "success" ? "Успешно" : p.status === "failed" ? "Ошибка" : "Ожидание"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
