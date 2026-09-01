"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, User as UserIcon, GraduationCap, ChevronRight } from "lucide-react";
import { fetchAdminClassesOverview, AdminClassSummary } from "@/lib/class-utils";
import { accuracyColor } from "@/lib/status-colors";
import { pluralizeRu } from "@/lib/pluralize-ru";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

export default function AdminClassesPage() {
    const [classes, setClasses] = useState<AdminClassSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const { locale } = useLocale();
    const t = useTranslations("adminClasses");

    useEffect(() => {
        (async () => {
            setLoading(true);
            setClasses(await fetchAdminClassesOverview());
            setLoading(false);
        })();
    }, []);

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
                            <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : classes.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <Users size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("noClassesYet")}</p>
                        <p className="mt-1 text-sm text-muted-foreground/70">{t("noClassesHint")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {classes.map((c) => (
                            <Link
                                key={c.id}
                                href={`/admin/classes/${c.id}`}
                                className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                            >
                                <div className="flex min-w-0 items-center gap-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                                        <GraduationCap size={18} />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{c.name}</p>
                                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <UserIcon size={12} /> {c.teacherName}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
                                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
                                        <Users size={13} /> {c.memberCount} {locale === "ru" ? pluralizeRu(c.memberCount, ["ученик", "ученика", "учеников"]) : t("studentWord")}
                                    </span>
                                    <span className={`rounded-xl px-3 py-2 text-xs font-extrabold tabular-nums ${accuracyColor(c.avgAccuracy)}`}>
                                        {c.avgAccuracy !== null ? `${c.avgAccuracy}%` : "—"}
                                    </span>
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
