"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Building2, CalendarRange, Trophy } from "lucide-react";
import {
    fetchBranchOverview, fetchBranchSubjectBreakdown,
    BranchOverview, BranchSubjectRow,
} from "@/lib/class-utils";
import { accuracyColor } from "@/lib/status-colors";
import { formatScore, certificatePercent, CERTIFICATE_MAX } from "@/lib/certificate-scale";
import { CoreSubject } from "@/lib/mock-import-schema";
import { foldSubjectBreakdown } from "@/lib/branch-subject-fold";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Филиал в разрезе предметов. Открывается кликом по филиалу в списке.
//
// ═══ ЗАЧЕМ ═══
//
// В списке филиалов месячный балл — одно число на весь филиал. По нему видно,
// что филиал просел, но не видно, какой предмет его тянет. Здесь тот же балл
// разложен по предметам, и решение «куда добавить часов» становится читаемым.
//
// Ничего не считает: и общий балл, и разбор приходят из SQL
// (get_branch_overview и get_branch_subject_breakdown), причём с одинаковыми
// условиями — иначе сумма по предметам не сошлась бы с числом в списке.

export default function AdminBranchDetailPage() {
    const { id } = useParams();
    const branchId = id as string;
    const t = useTranslations("adminBranchDetail");
    const tBranches = useTranslations("adminBranches");
    const tSubjects = useTranslations("mockTestStudio");

    const [branch, setBranch] = useState<BranchOverview | null>(null);
    const [rows, setRows] = useState<BranchSubjectRow[]>([]);
    const [loading, setLoading] = useState(true);

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
        let active = true;
        (async () => {
            setLoading(true);
            const [overview, breakdown] = await Promise.all([
                fetchBranchOverview().catch(() => [] as BranchOverview[]),
                fetchBranchSubjectBreakdown(branchId).catch(() => [] as BranchSubjectRow[]),
            ]);
            if (!active) return;
            setBranch(overview.find((b) => b.branchId === branchId) ?? null);
            setRows(breakdown);
            setLoading(false);
        })();
        return () => { active = false; };
    }, [branchId]);

    // Свёртка и порядок — в branch-subject-fold.ts: там взвешивание по числу
    // попыток, и его надо было закрыть тестом, а не держать в вёрстке.
    const buckets = useMemo(() => foldSubjectBreakdown(rows), [rows]);

    const hasOylik = buckets.some((b) => b.oylikAttempts > 0);

    if (loading) {
        return (
            <div className="flex flex-col gap-6">
                <div className="h-9 w-64 animate-pulse rounded-2xl bg-muted" />
                <div className="h-40 animate-pulse rounded-2xl border border-border bg-muted" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8">
            <section>
                <Link
                    href="/admin/branches"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft size={15} /> {t("back")}
                </Link>
                <div className="mt-3 flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand-olive-soft))] text-[hsl(var(--brand-olive-ink))]">
                        <Building2 size={20} />
                    </span>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                        {branch?.branchName ?? t("unknownBranch")}
                    </h1>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("subtitle")}</p>
            </section>

            {/* Те же два числа, что в списке филиалов — чтобы разбор ниже было
                с чем сверять. */}
            {branch && (
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <HeadlineCard
                        icon={Trophy}
                        label={tBranches("avgScoreLabel")}
                        score={branch.avgScore}
                        emptyLabel={tBranches("noResultsYet")}
                    />
                    <HeadlineCard
                        icon={CalendarRange}
                        label={t("oylikHeadline")}
                        score={branch.avgOylik}
                        emptyLabel={tBranches("noOylikYet")}
                    />
                </section>
            )}

            <section>
                <h2 className="text-xl font-bold tracking-tight text-foreground">{t("bySubjectTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("bySubjectHint")}</p>

                {buckets.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-border bg-muted/50 py-12 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">{t("noResults")}</p>
                        <p className="mt-1 text-sm text-muted-foreground/70">{t("noResultsHint")}</p>
                    </div>
                ) : (
                    <>
                        {/* Молчать о том, что месячных сдач нет вовсе, нельзя:
                            иначе пустая колонка читается как «предметы плохие». */}
                        {!hasOylik && (
                            <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm font-medium text-muted-foreground">
                                {t("noOylikAnywhere")}
                            </p>
                        )}
                        <ul className="mt-4 space-y-2">
                            {buckets.map((bucket) => {
                                const label = bucket.core ? subjectLabels[bucket.core] : bucket.key;
                                return (
                                    <li
                                        key={bucket.key}
                                        className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-foreground">{label}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                {t("attempts").replace("{count}", String(bucket.overallAttempts))}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-start gap-4 self-start sm:self-auto">
                                            <ScoreCell
                                                label={t("oylikColumn")}
                                                score={bucket.oylikAvg}
                                                attempts={bucket.oylikAttempts}
                                                emptyLabel={tBranches("noOylikYet")}
                                                attemptsLabel={t("attemptsShort")}
                                            />
                                            <ScoreCell
                                                label={t("overallColumn")}
                                                score={bucket.overallAvg}
                                                attempts={bucket.overallAttempts}
                                                emptyLabel={tBranches("noResultsYet")}
                                                attemptsLabel={t("attemptsShort")}
                                            />
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </section>
        </div>
    );
}

function HeadlineCard({ icon: Icon, label, score, emptyLabel }: {
    icon: typeof Trophy; label: string; score: number | null; emptyLabel: string;
}) {
    return (
        <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                <Icon size={18} />
            </div>
            <p className="text-xs text-muted-foreground">{label}</p>
            {score !== null ? (
                // Цвет — от ПРОЦЕНТА: accuracyColor сравнивает с 80 и 50, а сюда
                // приходит балл по шкале 75.
                <p className={`mt-1 inline-flex rounded-lg px-2 py-0.5 text-2xl font-semibold tabular-nums ${accuracyColor(certificatePercent(score, CERTIFICATE_MAX))}`}>
                    {formatScore(score)}
                </p>
            ) : (
                <p className="mt-1 text-sm font-medium text-muted-foreground">{emptyLabel}</p>
            )}
        </div>
    );
}

function ScoreCell({ label, score, attempts, emptyLabel, attemptsLabel }: {
    label: string; score: number | null; attempts: number; emptyLabel: string; attemptsLabel: string;
}) {
    return (
        <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
            {score !== null ? (
                <>
                    <span className={`rounded-xl px-4 py-2 text-sm font-extrabold tabular-nums ${accuracyColor(certificatePercent(score, CERTIFICATE_MAX))}`}>
                        {formatScore(score)}
                    </span>
                    {/* Балл без знаменателя не читается: 75 на одной сдаче и 75
                        на сорока — разные утверждения. */}
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                        {attemptsLabel.replace("{count}", String(attempts))}
                    </span>
                </>
            ) : (
                <span className="rounded-xl border border-border bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground">
                    {emptyLabel}
                </span>
            )}
        </div>
    );
}
