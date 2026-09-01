"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { fetchPlacementResultsForStaff, StaffPlacementResult } from "@/lib/staff-utils";
import { accuracyColor } from "@/lib/status-colors";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

export default function StaffPlacementResultsPage() {
    const { locale } = useLocale();
    const t = useTranslations("staffPlacementResults");
    const [results, setResults] = useState<StaffPlacementResult[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setResults(await fetchPlacementResultsForStaff());
            setLoading(false);
        })();
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return results;
        return results.filter((r) => `${r.userName} ${r.userPhone || ""} ${r.testTitle}`.toLowerCase().includes(q));
    }, [results, search]);

    const fmtDate = (d: string) => new Date(d).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ");

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t("subtitle")}
                </p>
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
                                    <p className="truncate font-semibold text-foreground">{r.userName}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{r.userPhone || "—"} • {r.testTitle}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{fmtDate(r.completedAt)}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                                    <span className={`rounded-xl px-3 py-1.5 text-sm font-extrabold tabular-nums ${accuracyColor(r.accuracy)}`}>{r.accuracy}%</span>
                                    <p className="text-xs text-muted-foreground">{r.correctAnswers}/{r.totalQuestions} {t("correctSuffix")}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
