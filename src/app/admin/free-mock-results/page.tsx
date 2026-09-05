"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Gift, Users, Calendar, ChevronRight } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { CORE_SUBJECTS, CoreSubject, coreSubjectMatches } from "@/lib/mock-import-schema";
import { accuracyColor } from "@/lib/status-colors";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

type FreeMockRow = {
    id: string;
    title: string;
    subjectId: string | null;
    createdAt: string;
    completedCount: number;
    avgScore: number | null;
};

// §2 и §14: отдельный раздел под результаты бесплатных моков, с вкладками по
// семи предметам, чтобы он работал и для будущих бесплатных тестов, а не только
// для ближайшего.
//
// Никакой отдельной логики «показать именно субботний мок» не нужно: условие
// одно — type = 'free'. Пока такой тест один, раздел показывает только его.
export default function AdminFreeMockResultsPage() {
    const { locale } = useLocale();
    const t = useTranslations("adminFreeMockResults");
    const tSubjects = useTranslations("mockTestStudio");
    const [rows, setRows] = useState<FreeMockRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSubject, setActiveSubject] = useState<CoreSubject | "all">("all");

    const subjectLabels: Record<CoreSubject, string> = useMemo(() => ({
        math: tSubjects("subjectMath"),
        physics: tSubjects("subjectPhysics"),
        chemistry: tSubjects("subjectChemistry"),
        biology: tSubjects("subjectBiology"),
        history: tSubjects("subjectHistory"),
        english: tSubjects("subjectEnglish"),
        native: tSubjects("subjectNative"),
    }), [tSubjects]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const { data: tests } = await supabase
                .from("mock_tests")
                .select("id, title, subject_id, created_at")
                .eq("type", "free")
                .order("created_at", { ascending: false });
            const testRows = (tests || []) as Array<{ id: string; title: string; subject_id: string | null; created_at: string }>;
            if (testRows.length === 0) {
                setRows([]);
                setLoading(false);
                return;
            }

            // Пагинация обязательна: на моке со ста участниками плоский select
            // молча обрезался бы по max_rows PostgREST, и «сдали» показало бы
            // меньше, чем на самом деле.
            const { data: results } = await fetchAllRows<{ mock_test_id: string; accuracy: number; revealed_at: string | null }>(
                (from, to) => supabase.from("mock_results")
                    .select("mock_test_id, accuracy, revealed_at")
                    .in("mock_test_id", testRows.map((test) => test.id))
                    .order("id").range(from, to)
            );

            const byTest = new Map<string, number[]>();
            const takersByTest = new Map<string, number>();
            (results || []).forEach((r) => {
                takersByTest.set(r.mock_test_id, (takersByTest.get(r.mock_test_id) || 0) + 1);
                if (!r.revealed_at) return;
                const list = byTest.get(r.mock_test_id) || [];
                list.push(r.accuracy);
                byTest.set(r.mock_test_id, list);
            });

            setRows(testRows.map((test) => {
                const scores = byTest.get(test.id) || [];
                return {
                    id: test.id,
                    title: test.title,
                    subjectId: test.subject_id,
                    createdAt: test.created_at,
                    completedCount: takersByTest.get(test.id) || 0,
                    // Средний по тесту — в процентах: это агрегат, а балл за
                    // отдельную работу открывается на странице результатов теста
                    // (design/FIX.md, «Правило отображения баллов»).
                    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
                };
            }));
            setLoading(false);
        })();
    }, []);

    const visible = activeSubject === "all"
        ? rows
        : rows.filter((row) => coreSubjectMatches(row.subjectId, activeSubject));

    const countBySubject = (subject: CoreSubject) =>
        rows.filter((row) => coreSubjectMatches(row.subjectId, subject)).length;

    return (
        <div className="flex flex-col gap-8">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{t("subtitle")}</p>
            </section>

            <section className="flex flex-wrap gap-2">
                <button
                    onClick={() => setActiveSubject("all")}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                        activeSubject === "all" ? "border-transparent bg-[hsl(var(--brand-blue-ink))] text-white" : "border-border hover:bg-muted"
                    }`}
                >
                    {t("allSubjects")} ({rows.length})
                </button>
                {CORE_SUBJECTS.map((subject) => (
                    <button
                        key={subject}
                        onClick={() => setActiveSubject(subject)}
                        className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                            activeSubject === subject ? "border-transparent bg-[hsl(var(--brand-blue-ink))] text-white" : "border-border hover:bg-muted"
                        }`}
                    >
                        {subjectLabels[subject]} ({countBySubject(subject)})
                    </button>
                ))}
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => <div key={n} className="h-20 animate-pulse rounded-2xl border border-border bg-muted" />)}
                    </div>
                ) : visible.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <Gift size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{rows.length === 0 ? t("noFreeMocksYet") : t("noMocksForSubject")}</p>
                        <p className="mt-1 text-sm text-muted-foreground/70">{t("createHint")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {visible.map((row) => (
                            <Link
                                key={row.id}
                                href={`/admin/mock-tests/${row.id}/results`}
                                className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                            >
                                <div className="flex min-w-0 items-center gap-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                                        <Gift size={18} />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{row.title}</p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Calendar size={12} />
                                                {new Date(row.createdAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ", { day: "numeric", month: "long", year: "numeric" })}
                                            </span>
                                            <span className="flex items-center gap-1"><Users size={12} /> {t("takersLabel").replace("{count}", String(row.completedCount))}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-3 self-start sm:self-auto">
                                    {row.avgScore !== null ? (
                                        <span className={`rounded-xl px-3 py-1.5 text-sm font-extrabold tabular-nums ${accuracyColor(row.avgScore)}`}>
                                            {row.avgScore}
                                        </span>
                                    ) : (
                                        <span className="rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                                            {t("notPublishedYet")}
                                        </span>
                                    )}
                                    <ChevronRight size={16} className="text-muted-foreground" />
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
