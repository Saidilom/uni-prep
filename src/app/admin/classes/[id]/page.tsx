"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, ClipboardList, ChevronDown } from "lucide-react";
import {
    fetchClassById,
    fetchClassMembers,
    fetchClassStudentsOverview,
    fetchClassMockAssignments,
    fetchClassStudentMockAssignments,
    ClassMockAssignment,
    ClassStudentMockAssignment,
    ClassStudentOverview,
    fetchClassStudentMockScores,
    StudentMockScore,
} from "@/lib/class-utils";
import { Class, User } from "@/lib/firestore-schema";
import { accuracyColor } from "@/lib/status-colors";
import { MOCK_SCALE_MAX } from "@/lib/rasch";
import { gradeLevelDisplay, GradeLevel } from "@/lib/mock-grade-level";
import { pluralizeRu } from "@/lib/pluralize-ru";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

export default function AdminClassDetailPage() {
    const { id } = useParams();
    const classId = id as string;
    const router = useRouter();
    const { locale } = useLocale();
    const t = useTranslations("adminClassDetail");

    const [cls, setCls] = useState<Class | null>(null);
    const [members, setMembers] = useState<User[]>([]);
    const [students, setStudents] = useState<ClassStudentOverview[]>([]);
    const [assignments, setAssignments] = useState<ClassMockAssignment[]>([]);
    const [studentAssignments, setStudentAssignments] = useState<ClassStudentMockAssignment[]>([]);
    const [mockScores, setMockScores] = useState<Map<string, StudentMockScore[]>>(new Map());
    const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const [c, m, s, a, sa, ms] = await Promise.all([
                fetchClassById(classId),
                fetchClassMembers(classId),
                fetchClassStudentsOverview(classId),
                fetchClassMockAssignments(classId),
                fetchClassStudentMockAssignments(classId),
                fetchClassStudentMockScores(classId),
            ]);
            setCls(c);
            setMembers(m);
            setStudents(s);
            setAssignments(a);
            setStudentAssignments(sa);
            setMockScores(ms);
            setLoading(false);
        })();
    }, [classId]);

    if (loading) {
        return (
            <div className="flex flex-col gap-6">
                <div className="h-9 w-64 animate-pulse rounded-2xl bg-muted" />
                <div className="h-40 animate-pulse rounded-2xl border border-border bg-muted" />
            </div>
        );
    }

    if (!cls) {
        return (
            <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                <p className="font-medium text-muted-foreground">{t("classNotFound")}</p>
            </div>
        );
    }

    const avgAccuracy = (() => {
        const scored = students.filter((s): s is ClassStudentOverview & { avgAccuracy: number } => s.avgAccuracy !== null);
        if (scored.length === 0) return null;
        return Math.round(scored.reduce((sum, s) => sum + s.avgAccuracy, 0) / scored.length);
    })();

    return (
        <div className="flex flex-col gap-10">
            <section>
                <button onClick={() => router.push("/admin/classes")} className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
                    <ArrowLeft size={14} /> {t("backToClasses")}
                </button>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{cls.name}</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    {members.length} {locale === "ru" ? pluralizeRu(members.length, ["ученик", "ученика", "учеников"]) : t("studentWord")}
                    {avgAccuracy !== null && (
                        <>
                            {" · "}
                            <span className={`inline-flex items-center rounded-lg px-2 py-0.5 font-extrabold tabular-nums ${accuracyColor(avgAccuracy)}`}>{t("avgResultSuffix").replace("{score}", String(avgAccuracy))}</span>
                        </>
                    )}
                </p>
            </section>

            <section>
                <h2 className="mb-5 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t("studentsSection")}</h2>
                {students.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <Users size={24} className="mx-auto mb-2 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("noStudentsInGroup")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {students.map((s) => {
                            const scores = mockScores.get(s.student.id) || [];
                            const isOpen = expandedStudent === s.student.id;
                            return (
                            <div key={s.student.id} className="rounded-2xl border border-border bg-card">
                                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted font-bold text-foreground">
                                            {s.student.name[0]?.toUpperCase() || "?"}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-foreground">{s.student.name} {s.student.surname || ""}</p>
                                            <p className="font-mono text-xs text-muted-foreground">{s.student.shortId}</p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <span className="text-xs text-muted-foreground">
                                            {s.attemptCount > 0 ? `${s.attemptCount} ${locale === "ru" ? pluralizeRu(s.attemptCount, ["попытка", "попытки", "попыток"]) : t("attemptWord")}` : t("neverTakenTests")}
                                        </span>
                                        {/* Средний по ученику — в процентах; балл за отдельный
                                            мок в раскрытии ниже — по шкале Раша (design/FIX.md). */}
                                        <span className={`rounded-xl px-3 py-1.5 text-sm font-extrabold tabular-nums ${accuracyColor(s.avgAccuracy)}`}>
                                            {s.avgAccuracy !== null ? `${s.avgAccuracy}%` : "—"}
                                        </span>
                                        <button
                                            onClick={() => setExpandedStudent(isOpen ? null : s.student.id)}
                                            disabled={scores.length === 0}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
                                        >
                                            {t("mockScoresAction").replace("{count}", String(scores.length))}
                                            <ChevronDown size={13} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                        </button>
                                    </div>
                                </div>
                                {isOpen && scores.length > 0 && (
                                    <div className="space-y-2 border-t border-border p-4">
                                        {scores.map((score) => (
                                            <div key={score.mockTestId} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-foreground">{score.title}</p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {new Date(score.completedAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ", { day: "numeric", month: "long", year: "numeric" })}
                                                    </p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    {score.gradeLevel && (
                                                        <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                                                            {gradeLevelDisplay(score.gradeLevel as GradeLevel, locale)}
                                                        </span>
                                                    )}
                                                    {!score.revealed ? (
                                                        <span className="rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                                                            {t("resultsPendingLabel")}
                                                        </span>
                                                    ) : score.levelScore != null ? (
                                                        <span className={`rounded-lg px-2.5 py-1 text-xs font-extrabold tabular-nums ${accuracyColor(Math.round((score.levelScore / MOCK_SCALE_MAX) * 100))}`}>
                                                            {score.levelScore}/{MOCK_SCALE_MAX}
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                                                            {t("levelPendingShort")}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <section>
                <h2 className="mb-5 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t("assignedMockTests")}</h2>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div>
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("wholeGroup")}</h3>
                        {assignments.length === 0 ? (
                            <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                                <ClipboardList size={24} className="mx-auto mb-2 text-muted-foreground/50" />
                                <p className="font-medium text-muted-foreground">{t("noGroupTestsYet")}</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {assignments.map((a) => (
                                    <Link
                                        key={a.id}
                                        href={`/admin/classes/${classId}/results/${a.mockTestId}`}
                                        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/40"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-foreground">{a.title}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                {t("durationCompletedTemplate").replace("{duration}", String(a.durationMinutes)).replace("{completed}", String(a.completedCount)).replace("{total}", String(members.length))}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("individualStudents")}</h3>
                        {studentAssignments.length === 0 ? (
                            <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                                <ClipboardList size={24} className="mx-auto mb-2 text-muted-foreground/50" />
                                <p className="font-medium text-muted-foreground">{t("noIndividualAssignments")}</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {studentAssignments.map((a) => (
                                    <div key={a.id} className="rounded-2xl border border-border bg-card p-4">
                                        <p className="truncate text-sm font-semibold text-foreground">{a.title}</p>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                            {t("studentDurationCompletedTemplate").replace("{student}", a.studentName).replace("{duration}", String(a.durationMinutes)).replace("{status}", a.completed ? t("completedWord") : t("notCompletedWord"))}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}
