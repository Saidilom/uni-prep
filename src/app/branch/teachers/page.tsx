"use client";

import { useEffect, useState } from "react";
import { GraduationCap, Mail, Phone, Users } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { User as UserType } from "@/lib/firestore-schema";
import { fetchAdminTeachersOverview } from "@/lib/class-utils";
import { accuracyColor } from "@/lib/status-colors";
import { useTranslations } from "@/lib/i18n/locale-provider";

type TeacherRow = UserType & { classCount: number; avgAccuracy: number | null };

// Список учителей филиала. Как и на странице групп, фильтр по филиалу делает
// не запрос, а политика users_branch_admin_read (миграция 072): учителя чужих
// филиалов просто не приходят.
export default function BranchTeachersPage() {
    const t = useTranslations("branchTeachers");
    const [teachers, setTeachers] = useState<TeacherRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const { data } = await supabase.from("users").select("*").eq("role", "teacher");
            const rows = (data || []) as TeacherRow[];
            if (rows.length > 0) {
                const overview = await fetchAdminTeachersOverview().catch(() => new Map());
                rows.forEach((row) => {
                    const stats = overview.get(row.id);
                    row.classCount = stats?.classCount ?? 0;
                    row.avgAccuracy = stats?.avgAccuracy ?? null;
                });
            }
            setTeachers(rows);
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
                        {[1, 2].map((n) => <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />)}
                    </div>
                ) : teachers.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <GraduationCap size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("noTeachersYet")}</p>
                        <p className="mt-1 max-w-md mx-auto text-sm text-muted-foreground/70">{t("noTeachersHint")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {teachers.map((teacher) => (
                            <div key={teacher.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
                                <div className="flex min-w-0 items-center gap-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))]/10 font-bold text-[hsl(var(--brand-blue-ink))]">
                                        {teacher.name?.[0]?.toUpperCase() || "?"}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{teacher.name} {teacher.surname || ""}</p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            {teacher.email && <span className="flex items-center gap-1"><Mail size={12} />{teacher.email}</span>}
                                            {teacher.phone && <span className="flex items-center gap-1"><Phone size={12} />{teacher.phone}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
                                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
                                        <Users size={13} /> {t("classesCount").replace("{count}", String(teacher.classCount))}
                                    </span>
                                    {teacher.avgAccuracy !== null && (
                                        <span className={`rounded-xl px-3 py-2 text-xs font-extrabold tabular-nums ${accuracyColor(teacher.avgAccuracy)}`}>
                                            {teacher.avgAccuracy}%
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
