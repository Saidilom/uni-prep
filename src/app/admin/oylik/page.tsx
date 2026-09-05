"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Plus, Send, Lock, LockOpen, ChevronDown, X } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/useToast";
import {
    fetchOylikSets,
    createOylikSet,
    publishOylikSet,
    closeMockForAllClasses,
    fetchMockClassAssignments,
    setClassAssignmentClosed,
    OylikSet,
    MockClassAssignmentRow,
} from "@/lib/class-utils";
import { CORE_SUBJECTS, CoreSubject, coreSubjectMatches } from "@/lib/mock-import-schema";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

// §6 и §7: комплекты «Ойлик тест».
//
// Комплект — до семи предметных тестов. Ученику достаётся тот, чей предмет
// совпадает с предметом его группы: раздачу целиком делает publish_oylik_set
// (миграция 073), здесь только кнопка.
//
// Жёсткого расписания нет по решению владельца — комплект грузится тогда, когда
// нужно, хоть каждый день, хоть раз в месяц.
export default function AdminOylikPage() {
    const { user } = useAuthStore();
    const { locale } = useLocale();
    const t = useTranslations("adminOylik");
    const tSubjects = useTranslations("mockTestStudio");
    const toast = useToast();
    const [sets, setSets] = useState<OylikSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [saving, setSaving] = useState(false);
    const [busyTest, setBusyTest] = useState<string | null>(null);
    const [expandedTest, setExpandedTest] = useState<string | null>(null);
    const [assignments, setAssignments] = useState<MockClassAssignmentRow[]>([]);

    const subjectLabels: Record<CoreSubject, string> = useMemo(() => ({
        math: tSubjects("subjectMath"),
        physics: tSubjects("subjectPhysics"),
        chemistry: tSubjects("subjectChemistry"),
        biology: tSubjects("subjectBiology"),
        history: tSubjects("subjectHistory"),
        english: tSubjects("subjectEnglish"),
        native: tSubjects("subjectNative"),
    }), [tSubjects]);

    const load = async () => {
        setLoading(true);
        try {
            setSets(await fetchOylikSets());
        } catch (error) {
            toast.error(t("loadFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCreate = async () => {
        if (!user || newTitle.trim().length < 1) return;
        setSaving(true);
        try {
            await createOylikSet(newTitle.trim(), user.id);
            setNewTitle("");
            setCreating(false);
            toast.success(t("setCreatedToast"));
            await load();
        } catch (error) {
            toast.error(t("setCreateFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async (set: OylikSet) => {
        setSaving(true);
        try {
            const result = await publishOylikSet(set.id);
            toast.success(t("publishedToast").replace("{count}", String(result.assignedCount)));
            // Пропущенные группы — отдельным предупреждением, а не молча:
            // «опубликовано» само по себе читается как «дошло до всех».
            if (result.skippedNoSubject > 0) {
                toast.error(t("skippedNoSubjectToast").replace("{count}", String(result.skippedNoSubject)));
            }
            if (result.skippedNoMatch > 0) {
                toast.info(t("skippedNoMatchToast").replace("{count}", String(result.skippedNoMatch)));
            }
            await load();
        } catch (error) {
            toast.error(t("publishFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setSaving(false);
        }
    };

    const handleCloseAll = async (testId: string) => {
        setBusyTest(testId);
        try {
            const closed = await closeMockForAllClasses(testId);
            toast.success(t("closedAllToast").replace("{count}", String(closed)));
            await load();
            if (expandedTest === testId) setAssignments(await fetchMockClassAssignments(testId));
        } catch (error) {
            toast.error(t("closeFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setBusyTest(null);
        }
    };

    const toggleExpand = async (testId: string) => {
        if (expandedTest === testId) {
            setExpandedTest(null);
            return;
        }
        setExpandedTest(testId);
        setAssignments(await fetchMockClassAssignments(testId).catch(() => []));
    };

    const toggleAssignment = async (row: MockClassAssignmentRow, testId: string) => {
        setBusyTest(row.id);
        try {
            await setClassAssignmentClosed(row.id, !row.closedAt);
            setAssignments(await fetchMockClassAssignments(testId));
        } catch (error) {
            toast.error(t("closeFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setBusyTest(null);
        }
    };

    const subjectLabelFor = (subjectId: string | null) => {
        const core = CORE_SUBJECTS.find((subject) => coreSubjectMatches(subjectId, subject));
        return core ? subjectLabels[core] : subjectId || "—";
    };

    return (
        <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{t("subtitle")}</p>
                </div>
                {!creating && (
                    <button
                        onClick={() => setCreating(true)}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[hsl(var(--brand-blue-ink))] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
                    >
                        <Plus size={16} /> {t("createSet")}
                    </button>
                )}
            </section>

            {creating && (
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                    <input
                        autoFocus
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                        placeholder={t("setTitlePlaceholder")}
                        className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />
                    <button onClick={handleCreate} disabled={saving || newTitle.trim().length < 1} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                        {saving ? t("saving") : t("create")}
                    </button>
                    <button onClick={() => { setCreating(false); setNewTitle(""); }} className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted" aria-label={t("cancel")}>
                        <X size={16} />
                    </button>
                </div>
            )}

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2].map((n) => <div key={n} className="h-28 animate-pulse rounded-2xl border border-border bg-muted" />)}
                    </div>
                ) : sets.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <CalendarDays size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("noSetsYet")}</p>
                        <p className="mt-1 max-w-lg mx-auto text-sm text-muted-foreground/70">{t("noSetsHint")}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {sets.map((set) => (
                            <div key={set.id} className="rounded-2xl border border-border bg-card p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{set.title}</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {new Date(set.createdAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ", { day: "numeric", month: "long", year: "numeric" })}
                                            {" · "}
                                            {t("testsInSet").replace("{count}", String(set.tests.length))}
                                            {set.publishedAt && ` · ${t("publishedLabel")}`}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <Link href="/admin/mock-tests" className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted">
                                            {t("addTestAction")}
                                        </Link>
                                        <button
                                            onClick={() => handlePublish(set)}
                                            disabled={saving || set.tests.length === 0}
                                            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40"
                                        >
                                            <Send size={13} /> {set.publishedAt ? t("republishAction") : t("publishAction")}
                                        </button>
                                    </div>
                                </div>

                                {set.tests.length === 0 ? (
                                    <p className="mt-4 rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">{t("emptySetHint")}</p>
                                ) : (
                                    <div className="mt-4 space-y-2">
                                        {set.tests.map((test) => (
                                            <div key={test.id} className="rounded-xl border border-border">
                                                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium text-foreground">{test.title}</p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {subjectLabelFor(test.subjectId)} · {t("assignedToClasses").replace("{count}", String(test.assignedCount))}
                                                            {test.closedAt && ` · ${t("closedLabel")}`}
                                                        </p>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-2">
                                                        <button
                                                            onClick={() => toggleExpand(test.id)}
                                                            disabled={test.assignedCount === 0}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-40"
                                                        >
                                                            {t("byClassAction")}
                                                            <ChevronDown size={12} className={`transition-transform ${expandedTest === test.id ? "rotate-180" : ""}`} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleCloseAll(test.id)}
                                                            disabled={busyTest === test.id || test.assignedCount === 0}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/30"
                                                        >
                                                            <Lock size={12} /> {t("closeAllAction")}
                                                        </button>
                                                    </div>
                                                </div>
                                                {expandedTest === test.id && (
                                                    <div className="space-y-1.5 border-t border-border px-4 py-3">
                                                        {assignments.length === 0 ? (
                                                            <p className="text-[11px] text-muted-foreground">{t("noClassesAssigned")}</p>
                                                        ) : assignments.map((row) => (
                                                            <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
                                                                <span className="truncate text-xs font-medium text-foreground">{row.className}</span>
                                                                <button
                                                                    onClick={() => toggleAssignment(row, test.id)}
                                                                    disabled={busyTest === row.id}
                                                                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40 ${
                                                                        row.closedAt ? "border-border text-muted-foreground hover:bg-background" : "border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                                                    }`}
                                                                >
                                                                    {row.closedAt ? <><LockOpen size={11} /> {t("reopenClassAction")}</> : <><Lock size={11} /> {t("closeClassAction")}</>}
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
