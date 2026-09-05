"use client";

import { useEffect, useState } from "react";
import { UsersRound, GraduationCap } from "lucide-react";
import { fetchAdminClassesOverview, AdminClassSummary } from "@/lib/class-utils";
import { accuracyColor } from "@/lib/status-colors";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Переиспользуем тот же загрузчик, что и админский список групп: фильтровать
// по филиалу здесь нечем и не нужно — политика classes_branch_admin_read
// (миграция 072) уже отдаёт админу филиала только его группы, а чужие просто
// не приходят из базы.
export default function BranchClassesPage() {
    const t = useTranslations("branchClasses");
    const [classes, setClasses] = useState<AdminClassSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setClasses(await fetchAdminClassesOverview().catch(() => [] as AdminClassSummary[]));
            setLoading(false);
        })();
    }, []);

    return (
        <div className="flex flex-col gap-8">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("subtitle")}</p>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />)}
                    </div>
                ) : classes.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <UsersRound size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("noClassesYet")}</p>
                        <p className="mt-1 text-sm text-muted-foreground/70">{t("noClassesHint")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {classes.map((c) => (
                            <div key={c.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
                                <div className="flex min-w-0 items-center gap-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                                        <GraduationCap size={18} />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{c.name}</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {t("teacherPrefix")} {c.teacherName} · {t("studentsCount").replace("{count}", String(c.memberCount))}
                                        </p>
                                    </div>
                                </div>
                                <span className={`shrink-0 self-start rounded-xl px-3 py-1.5 text-sm font-extrabold tabular-nums sm:self-auto ${accuracyColor(c.avgScore)}`}>
                                    {c.avgScore ?? "—"}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
