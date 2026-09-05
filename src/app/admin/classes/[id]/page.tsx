"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
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
import ClassStudentsPanel from "@/components/class-students-panel";
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

    const avgScore = (() => {
        const scored = students.filter((s): s is ClassStudentOverview & { avgScore: number } => s.avgScore !== null);
        if (scored.length === 0) return null;
        return Math.round(scored.reduce((sum, s) => sum + s.avgScore, 0) / scored.length);
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
                    {avgScore !== null && (
                        <>
                            {" · "}
                            <span className={`inline-flex items-center rounded-lg px-2 py-0.5 font-extrabold tabular-nums ${accuracyColor(avgScore)}`}>{t("avgResultSuffix").replace("{score}", String(avgScore))}</span>
                        </>
                    )}
                </p>
            </section>

            <section>
                <h2 className="mb-5 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t("studentsSection")}</h2>
                <ClassStudentsPanel
                    students={students}
                    mockScores={mockScores}
                    assignments={assignments}
                    labels={{
                        attemptWord: t("attemptWord"),
                        neverTakenTests: t("neverTakenTests"),
                        mockScoresAction: t("mockScoresAction"),
                        resultsPendingLabel: t("resultsPendingLabel"),
                        levelPendingShort: t("levelPendingShort"),
                        filterAllMocks: t("filterAllMocks"),
                        filterLabel: t("filterLabel"),
                        notTakenThisMock: t("notTakenThisMock"),
                        mockNumberPrefix: t("mockNumberPrefix"),
                    }}
                />
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
