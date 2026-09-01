"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Clock, Award } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { fetchClassById, fetchStudentClassMocks, fetchMySubjectRanking, StudentClassMock, SubjectRanking } from "@/lib/class-utils";
import { Class } from "@/lib/firestore-schema";
import { accuracyColor } from "@/lib/status-colors";
import { gradeLevelDisplay, GradeLevel } from "@/lib/mock-grade-level";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

export default function StudentClassDetail({ classId }: { classId: string }) {
    const { user } = useAuthStore();
    const { locale } = useLocale();
    const t = useTranslations("studentClassDetail");
    const tSubjects = useTranslations("mockTestStudio");
    const [cls, setCls] = useState<Class | null>(null);
    const [mocks, setMocks] = useState<StudentClassMock[]>([]);
    const [rankings, setRankings] = useState<SubjectRanking[]>([]);
    const [loading, setLoading] = useState(true);

    const subjectLabels: Record<string, string> = useMemo(() => ({
        math: tSubjects("subjectMath"),
        physics: tSubjects("subjectPhysics"),
        chemistry: tSubjects("subjectChemistry"),
        biology: tSubjects("subjectBiology"),
        geography: tSubjects("subjectGeography"),
        history: tSubjects("subjectHistory"),
        english: tSubjects("subjectEnglish"),
        russian: tSubjects("subjectRussian"),
        uzbek: tSubjects("subjectUzbek"),
        it: tSubjects("subjectIt"),
        other: tSubjects("subjectOther"),
    }), [tSubjects]);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        Promise.all([
            fetchClassById(classId),
            fetchStudentClassMocks(classId, user.id),
            fetchMySubjectRanking(classId),
        ]).then(([c, m, r]) => {
            setCls(c);
            setMocks(m);
            setRankings(r);
            setLoading(false);
        });
    }, [classId, user]);

    if (!user) return null;

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

    return (
        <div className="flex flex-col gap-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section>
                <Link href="/classes" className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
                    <ArrowLeft size={14} /> {t("backToClasses")}
                </Link>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{cls.name}</h1>
            </section>

            {rankings.length > 0 && (
                <section>
                    <h2 className="mb-5 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t("rankingTitle")}</h2>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {rankings.map((r) => (
                            <div key={r.subjectId} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40">
                                    <Award size={18} />
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">{subjectLabels[r.subjectId] || r.subjectId}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{t("rankTemplate").replace("{rank}", String(r.myRank)).replace("{total}", String(r.totalStudents))}</p>
                                    <p className={`mt-1 inline-flex rounded-lg px-2 py-0.5 text-xs font-extrabold tabular-nums ${accuracyColor(r.myAvgAccuracy)}`}>{r.myAvgAccuracy}%</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section>
                <h2 className="mb-5 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t("assignedMockTests")}</h2>
                {mocks.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <ClipboardList size={24} className="mx-auto mb-2 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("noMocksYet")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {mocks.map((m) => (
                            <Link
                                key={m.mockTestId}
                                href={`/mock/${m.mockTestId}`}
                                className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                            >
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-foreground">{m.title}</p>
                                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Clock size={12} /> {t("durationTemplate").replace("{duration}", String(m.durationMinutes))}
                                    </p>
                                </div>
                                {m.myResult && m.myResult.revealed ? (
                                    <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
                                        <span className={`rounded-xl px-3 py-1.5 text-sm font-extrabold tabular-nums ${accuracyColor(m.myResult.accuracy)}`}>
                                            {m.myResult.score}/{m.myResult.maxScore}
                                        </span>
                                        {m.myResult.gradeLevel && (
                                            <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                                                {gradeLevelDisplay(m.myResult.gradeLevel as GradeLevel, locale)}
                                            </span>
                                        )}
                                    </div>
                                ) : m.myResult ? (
                                    <span className="shrink-0 self-start rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:self-auto">
                                        {t("resultsPendingLabel")}
                                    </span>
                                ) : (
                                    <span className="shrink-0 self-start rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:self-auto">
                                        {t("notTakenYet")}
                                    </span>
                                )}
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
