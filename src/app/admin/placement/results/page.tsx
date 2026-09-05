"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Search, X } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { accuracyColor } from "@/lib/status-colors";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

type PlacementResultRow = {
    id: string;
    test_id: string;
    user_name: string;
    user_surname?: string;
    user_phone?: string;
    test_title: string;
    score: number;
    total_questions: number;
    correct_answers: number;
    accuracy: number;
    time_spent_seconds: number;
    completed_at: string;
};

export default function AdminPlacementResultsPage() {
    const searchParams = useSearchParams();
    const testFilter = searchParams.get("test");
    const [results, setResults] = useState<PlacementResultRow[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const { locale } = useLocale();
    const t = useTranslations("adminPlacementResults");

    const load = async () => {
        setLoading(true);
        let query = supabase.from("placement_results").select("*").order("completed_at", { ascending: false });
        if (testFilter) query = query.eq("test_id", testFilter);
        const { data } = await query;
        if (data) setResults(data as PlacementResultRow[]);
        setLoading(false);
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [testFilter]);

    const fmtDate = (d: string) => new Date(d).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ");

    const q = search.trim().toLowerCase();
    const filtered = q
        ? results.filter((r) => `${r.user_name} ${r.user_surname || ""} ${r.user_phone || ""}`.toLowerCase().includes(q))
        : results;

    // Вступительные тесты остаются в процентах — решение владельца (§8).
    const avgAccuracy = results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.accuracy, 0) / results.length) : null;

    return (
        <div className="flex flex-col gap-10">
            <section>
                {testFilter && (
                    <Link href="/admin/placement" className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
                        <ArrowLeft size={14} /> {t("backToSchool")}
                    </Link>
                )}
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    {testFilter ? (results[0]?.test_title ?? t("title")) : t("title")}
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {testFilter ? t("filteredSubtitle") : t("subtitle")}
                </p>
                {!loading && results.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <span className="rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                            {t("countLabel").replace("{count}", String(results.length))}
                        </span>
                        {avgAccuracy !== null && (
                            <span className={`rounded-xl px-3 py-1.5 text-xs font-bold ${accuracyColor(avgAccuracy)}`}>
                                {t("avgLabel").replace("{percent}", String(avgAccuracy))}
                            </span>
                        )}
                    </div>
                )}
            </section>

            <section className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4">
                <Search size={16} className="shrink-0 text-muted-foreground" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                {search && (
                    <button onClick={() => setSearch("")} className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted"><X size={14} /></button>
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
                        <p className="font-medium text-muted-foreground">{results.length === 0 ? t("noResultsYet") : t("noResultsForSearch")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((r) => (
                            <div
                                key={r.id}
                                className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:bg-muted/40 sm:flex-row sm:items-center"
                            >
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-foreground">{r.user_name} {r.user_surname || ""}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{r.user_phone || "—"}{!testFilter && ` • ${r.test_title}`}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{fmtDate(r.completed_at)}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                                    <span className={`rounded-xl px-3 py-1.5 text-sm font-extrabold tabular-nums ${accuracyColor(r.accuracy)}`}>{r.accuracy}%</span>
                                    <p className="text-xs text-muted-foreground">{r.correct_answers}/{r.total_questions} {t("correctSuffix")}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
