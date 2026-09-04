"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Users, GraduationCap, X, FileUp } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/useToast";
import { fetchTeacherClasses, createClass, ClassWithCount } from "@/lib/class-utils";
import { CORE_SUBJECTS, CoreSubject } from "@/lib/mock-import-schema";
import { pluralizeRu } from "@/lib/pluralize-ru";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

export default function TeacherDashboard() {
    const { user } = useAuthStore();
    const { locale } = useLocale();
    const t = useTranslations("teacherDashboard");
    const tSubjects = useTranslations("mockTestStudio");
    const subjectLabels: Record<CoreSubject, string> = useMemo(() => ({
        math: tSubjects("subjectMath"),
        physics: tSubjects("subjectPhysics"),
        chemistry: tSubjects("subjectChemistry"),
        biology: tSubjects("subjectBiology"),
        history: tSubjects("subjectHistory"),
        english: tSubjects("subjectEnglish"),
        native: tSubjects("subjectNative"),
    }), [tSubjects]);
    const toast = useToast();
    const [classes, setClasses] = useState<ClassWithCount[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [newSubject, setNewSubject] = useState<CoreSubject | "">("");
    const [saving, setSaving] = useState(false);

    const load = async () => {
        if (!user) return;
        setLoading(true);
        setClasses(await fetchTeacherClasses(user.id));
        setLoading(false);
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const handleCreate = async () => {
        if (!user || newName.trim().length < 1 || !newSubject) return;
        setSaving(true);
        try {
            await createClass(user.id, newName.trim(), newSubject);
            setNewName("");
            setNewSubject("");
            setCreating(false);
            toast.success(t("groupCreatedToast"));
            load();
        } catch (err) {
            toast.error(t("groupCreateErrorToast"), { description: String(err) });
        } finally {
            setSaving(false);
        }
    };

    const totalStudents = classes.reduce((sum, c) => sum + c.memberCount, 0);

    if (!user) return null;

    return (
        <div className="flex flex-col gap-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {t("welcomeBack")} <span className="font-medium text-muted-foreground">{user.name?.trim()}</span>
                </h1>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    {t("subtitle")}
                </p>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="grid grid-cols-2 sm:divide-x sm:divide-border">
                    <div className="p-6">
                        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <GraduationCap size={20} strokeWidth={1.75} />
                        </div>
                        <p className="text-xs text-muted-foreground">{locale === "ru" ? pluralizeRu(classes.length, ["Группа", "Группы", "Групп"]) : t("groupsLabel")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{classes.length}</p>
                    </div>
                    <div className="p-6">
                        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Users size={20} strokeWidth={1.75} />
                        </div>
                        <p className="text-xs text-muted-foreground">{locale === "ru" ? pluralizeRu(totalStudents, ["Ученик", "Ученика", "Учеников"]) : t("studentsLabel")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{totalStudents}</p>
                    </div>
                </div>
            </section>

            <section>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-bold tracking-tight text-[hsl(var(--brand-blue-ink))] sm:text-2xl">{t("myGroups")}</h2>
                    <div className="flex flex-wrap gap-2">
                      <Link href="/teacher/mock-tests" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted">
                        <FileUp size={16} /> {t("createMockFromPdf")}
                      </Link>
                      {!creating && (
                        <button
                            onClick={() => setCreating(true)}
                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
                        >
                            <Plus size={16} /> {t("createGroup")}
                        </button>
                      )}
                    </div>
                </div>

                {creating && (
                    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center">
                        <input
                            autoFocus
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                            placeholder={t("groupNamePlaceholder")}
                            className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                        />
                        {/* Предмет обязателен: по нему группа получает свой тест из
                            комплекта «Ойлик тест» (design/FIX.md, §6). */}
                        <select
                            value={newSubject}
                            onChange={(e) => setNewSubject(e.target.value as CoreSubject)}
                            className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                        >
                            <option value="">{t("subjectPlaceholder")}</option>
                            {CORE_SUBJECTS.map((subject) => (
                                <option key={subject} value={subject}>{subjectLabels[subject]}</option>
                            ))}
                        </select>
                        <button
                            onClick={handleCreate}
                            disabled={saving || newName.trim().length < 1 || !newSubject}
                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50"
                        >
                            {saving ? t("creating") : t("create")}
                        </button>
                        <button
                            onClick={() => { setCreating(false); setNewName(""); setNewSubject(""); }}
                            className="rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-muted"
                            aria-label={t("cancel")}
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                {loading ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-28 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : classes.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <GraduationCap size={28} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("noGroupsYet")}</p>
                        <p className="mt-1 text-sm text-muted-foreground/70">{t("createFirstGroup")}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {classes.map((cls) => (
                            <Link
                                key={cls.id}
                                href={`/classes/${cls.id}`}
                                className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:bg-muted/40"
                            >
                                <div>
                                    <p className="font-semibold text-foreground">{cls.name}</p>
                                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Users size={12} />
                                        {cls.memberCount} {locale === "ru" ? pluralizeRu(cls.memberCount, ["ученик", "ученика", "учеников"]) : t("studentWord")}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
