"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/supabase/client";
import { accuracyColor } from "@/lib/status-colors";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

type PlacementResultRow = {
    id: string;
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
    const [results, setResults] = useState<PlacementResultRow[]>([]);
    const [loading, setLoading] = useState(true);
    const { locale } = useLocale();
    const t = useTranslations("adminPlacementResults");

    const load = async () => {
        setLoading(true);
        const { data } = await supabase.from("placement_results").select("*").order("completed_at", { ascending: false });
        if (data) setResults(data as PlacementResultRow[]);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const fmtDate = (d: string) => new Date(d).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ");

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t("subtitle")}
                </p>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-20 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : results.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">{t("noResultsYet")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {results.map((r) => (
                            <div
                                key={r.id}
                                className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:bg-muted/40 sm:flex-row sm:items-center"
                            >
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-foreground">{r.user_name} {r.user_surname || ""}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{r.user_phone || "—"} • {r.test_title}</p>
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
