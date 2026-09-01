"use client";

import { useState } from "react";
import { Search, UserPlus, Loader2, GraduationCap } from "lucide-react";
import { useToast } from "@/hooks/useToast";
import { searchStudentsForStaff, promoteStudentToTeacher } from "@/lib/staff-utils";
import { User } from "@/lib/firestore-schema";
import { useTranslations } from "@/lib/i18n/locale-provider";

export default function StaffAssignPage() {
    const toast = useToast();
    const t = useTranslations("staffAssign");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<User[]>([]);
    const [searched, setSearched] = useState(false);
    const [searching, setSearching] = useState(false);
    const [promoting, setPromoting] = useState<string | null>(null);

    const runSearch = async () => {
        if (query.trim().length < 2) return;
        setSearching(true);
        try {
            setResults(await searchStudentsForStaff(query));
            setSearched(true);
        } finally {
            setSearching(false);
        }
    };

    const promote = async (student: User) => {
        const fullName = `${student.name} ${student.surname || ""}`.trim();
        if (!confirm(t("confirmPromote").replace("{name}", fullName))) return;
        setPromoting(student.id);
        try {
            await promoteStudentToTeacher(student.id);
            toast.success(t("promotedToast").replace("{name}", fullName));
            setResults((current) => current.filter((s) => s.id !== student.id));
        } catch (error) {
            toast.error(t("promoteFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setPromoting(null);
        }
    };

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t("subtitle")}
                </p>
            </section>

            <section className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                <Search size={16} className="shrink-0 text-muted-foreground" />
                <input
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setSearched(false); }}
                    onKeyDown={(e) => e.key === "Enter" && runSearch()}
                    placeholder={t("searchPlaceholder")}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <button
                    onClick={runSearch}
                    disabled={searching || query.trim().length < 2}
                    className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-all hover:opacity-90 disabled:opacity-50"
                >
                    {searching ? <Loader2 size={15} className="animate-spin" /> : null}
                    {searching ? t("searching") : t("find")}
                </button>
            </section>

            <section>
                {!searched ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <GraduationCap size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("searchHint")}</p>
                    </div>
                ) : results.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">{t("noStudentsFound")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {results.map((student) => (
                            <div key={student.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:bg-muted/40 sm:flex-row sm:items-center">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))]/10 font-bold text-[hsl(var(--brand-blue-ink))]">
                                        {student.name?.[0]?.toUpperCase() || "?"}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{student.name} {student.surname || ""}</p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            <span className="font-mono">{student.shortId}</span>
                                            {student.phone && <span>{student.phone}</span>}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => promote(student)}
                                    disabled={promoting === student.id}
                                    className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:opacity-50 sm:self-auto"
                                >
                                    {promoting === student.id ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                                    {promoting === student.id ? t("promoting") : t("makeTeacher")}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
