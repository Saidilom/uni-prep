"use client";

import { useEffect, useState } from "react";
import { Building2, Users, GraduationCap, Trophy } from "lucide-react";
import { fetchBranchOverview, BranchOverview } from "@/lib/class-utils";
import { accuracyColor } from "@/lib/status-colors";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Сводка по СВОЕМУ филиалу. Фильтрацию делает не эта страница, а сам
// get_branch_overview (миграция 072): админу филиала он возвращает ровно одну
// строку — его собственную. Ограничение живёт в базе, а не в интерфейсе.
export default function BranchOverviewPage() {
    const t = useTranslations("branchOverview");
    const [branch, setBranch] = useState<BranchOverview | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const rows = await fetchBranchOverview().catch(() => [] as BranchOverview[]);
            setBranch(rows[0] ?? null);
            setLoading(false);
        })();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col gap-6">
                <div className="h-9 w-64 animate-pulse rounded-2xl bg-muted" />
                <div className="h-32 animate-pulse rounded-2xl border border-border bg-muted" />
            </div>
        );
    }

    if (!branch) {
        return (
            <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                <Building2 size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-medium text-muted-foreground">{t("noBranchAssigned")}</p>
                <p className="mt-1 text-sm text-muted-foreground/70">{t("noBranchHint")}</p>
            </div>
        );
    }

    const cards = [
        { label: t("classesLabel"), value: branch.classCount, icon: GraduationCap },
        { label: t("teachersLabel"), value: branch.teacherCount, icon: Users },
        { label: t("studentsLabel"), value: branch.studentCount, icon: Users },
    ];

    return (
        <div className="flex flex-col gap-8">
            <section>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("title")}</p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{branch.branchName}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("subtitle")}</p>
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((card, index) => (
                    <div key={index} className="rounded-2xl border border-border bg-card p-5">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                            <card.icon size={18} />
                        </div>
                        <p className="text-xs text-muted-foreground">{card.label}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{card.value}</p>
                    </div>
                ))}
                <div className="rounded-2xl border border-border bg-card p-5">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                        <Trophy size={18} />
                    </div>
                    <p className="text-xs text-muted-foreground">{t("avgScoreLabel")}</p>
                    {branch.avgAccuracy !== null ? (
                        <p className={`mt-1 inline-flex rounded-lg px-2 py-0.5 text-2xl font-semibold tabular-nums ${accuracyColor(branch.avgAccuracy)}`}>
                            {branch.avgAccuracy}%
                        </p>
                    ) : (
                        <p className="mt-1 text-sm font-medium text-muted-foreground">{t("noResultsYet")}</p>
                    )}
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{t("avgScoreHint")}</p>
                </div>
            </section>
        </div>
    );
}
