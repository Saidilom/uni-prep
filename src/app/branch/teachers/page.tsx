"use client";

import { useEffect, useState } from "react";
import { GraduationCap, Mail, Phone, Users, Search, UserPlus, Loader2 } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { User as UserType } from "@/lib/firestore-schema";
import { fetchAdminTeachersOverview, searchStudentsForPromotion, promoteStudentToTeacherInBranch, PromotableStudent } from "@/lib/class-utils";
import { useToast } from "@/hooks/useToast";
import { accuracyColor } from "@/lib/status-colors";
import { useTranslations } from "@/lib/i18n/locale-provider";

type TeacherRow = UserType & { classCount: number; avgScore: number | null };

// Список учителей филиала. Как и на странице групп, фильтр по филиалу делает
// не запрос, а политика users_branch_admin_read (миграция 072): учителя чужих
// филиалов просто не приходят.
export default function BranchTeachersPage() {
    const t = useTranslations("branchTeachers");
    const toast = useToast();
    const [teachers, setTeachers] = useState<TeacherRow[]>([]);
    const [loading, setLoading] = useState(true);
    // §11: назначение учителей — работа админа филиала, а не супер-админа.
    const [query, setQuery] = useState("");
    const [found, setFound] = useState<PromotableStudent[]>([]);
    const [searched, setSearched] = useState(false);
    const [searching, setSearching] = useState(false);
    const [promoting, setPromoting] = useState<string | null>(null);

    const load = async () => {
            setLoading(true);
            const { data } = await supabase.from("users").select("*").eq("role", "teacher");
            const rows = (data || []) as TeacherRow[];
            if (rows.length > 0) {
                const overview = await fetchAdminTeachersOverview().catch(() => new Map());
                rows.forEach((row) => {
                    const stats = overview.get(row.id);
                    row.classCount = stats?.classCount ?? 0;
                    row.avgScore = stats?.avgScore ?? null;
                });
            }
            setTeachers(rows);
            setLoading(false);
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runSearch = async () => {
        if (query.trim().length < 2) return;
        setSearching(true);
        try {
            setFound(await searchStudentsForPromotion(query));
            setSearched(true);
        } catch (error) {
            toast.error(t("searchFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setSearching(false);
        }
    };

    const promote = async (student: PromotableStudent) => {
        const fullName = `${student.name} ${student.surname}`.trim();
        if (!confirm(t("confirmPromote").replace("{name}", fullName))) return;
        setPromoting(student.id);
        try {
            // Филиал не передаём: RPC сама подставит филиал вызывающего —
            // админ филиала может назначать только в свой (миграция 072).
            await promoteStudentToTeacherInBranch(student.id, null);
            toast.success(t("promotedToast").replace("{name}", fullName));
            setFound((current) => current.filter((s) => s.id !== student.id));
            await load();
        } catch (error) {
            toast.error(t("promoteFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setPromoting(null);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("subtitle")}</p>
            </section>

            {/* Назначение учителя. Ученик получает филиал этого админа, а его
                будущие группы наследуют филиал триггером — так их результаты
                попадают в средний балл именно этого филиала (§11). */}
            <section className="rounded-2xl border border-border bg-card p-5">
                <h2 className="text-sm font-bold text-foreground">{t("promoteTitle")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t("promoteHint")}</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <input
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setSearched(false); }}
                        onKeyDown={(e) => e.key === "Enter" && runSearch()}
                        placeholder={t("searchPlaceholder")}
                        className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/25"
                    />
                    <button
                        onClick={runSearch}
                        disabled={searching || query.trim().length < 2}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                    >
                        {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} {t("searchAction")}
                    </button>
                </div>
                {searched && found.length === 0 && (
                    <p className="mt-3 text-sm text-muted-foreground">{t("noStudentsFound")}</p>
                )}
                {found.length > 0 && (
                    <div className="mt-3 space-y-2">
                        {found.map((student) => (
                            <div key={student.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">{student.name} {student.surname}</p>
                                    <p className="font-mono text-xs text-muted-foreground">{student.shortId}</p>
                                </div>
                                <button
                                    onClick={() => promote(student)}
                                    disabled={promoting === student.id}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50"
                                >
                                    <UserPlus size={13} /> {promoting === student.id ? t("promoting") : t("promoteAction")}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
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
                                    {teacher.avgScore !== null && (
                                        <span className={`rounded-xl px-3 py-2 text-xs font-extrabold tabular-nums ${accuracyColor(teacher.avgScore)}`}>
                                            {teacher.avgScore}
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
