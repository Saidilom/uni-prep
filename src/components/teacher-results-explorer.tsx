"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Trophy, Users, Award, Calendar, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import {
    fetchTeacherResultsOverview,
    fetchClassStudentsOverview,
    TeacherResultsOverview,
    TeacherClassSummary,
    ClassStudentOverview,
} from "@/lib/class-utils";
import { fetchUserMockResults, MockResultRow } from "@/lib/registan-utils";
import { accuracyColor } from "@/lib/status-colors";
import { certificatePercent } from "@/lib/certificate-scale";
import { pluralizeRu } from "@/lib/pluralize-ru";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

export default function TeacherResultsExplorer() {
    const { user } = useAuthStore();
    const { locale } = useLocale();
    const t = useTranslations("teacherResults");
    const [overview, setOverview] = useState<TeacherResultsOverview | null>(null);
    const [loadingOverview, setLoadingOverview] = useState(true);

    const [selectedClass, setSelectedClass] = useState<TeacherClassSummary | null>(null);
    const [students, setStudents] = useState<ClassStudentOverview[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(false);

    const [selectedStudent, setSelectedStudent] = useState<ClassStudentOverview | null>(null);
    const [attempts, setAttempts] = useState<MockResultRow[]>([]);
    const [loadingAttempts, setLoadingAttempts] = useState(false);

    // Guards against a slower response for a previously-opened class/student
    // overwriting a faster one's already-rendered state — rapid switching
    // (open A, then B before A resolves) could otherwise show A's roster
    // under B's heading if A's fetch happens to land after B's.
    const latestClassRequest = useRef<string | null>(null);
    const latestStudentRequest = useRef<string | null>(null);

    useEffect(() => {
        if (!user) return;
        setLoadingOverview(true);
        fetchTeacherResultsOverview(user.id).then((data) => {
            setOverview(data);
            setLoadingOverview(false);
        });
    }, [user]);

    const openClass = (cls: TeacherClassSummary) => {
        latestClassRequest.current = cls.id;
        setSelectedClass(cls);
        setSelectedStudent(null);
        setLoadingStudents(true);
        fetchClassStudentsOverview(cls.id).then((data) => {
            if (latestClassRequest.current !== cls.id) return;
            setStudents(data);
            setLoadingStudents(false);
        });
    };

    const openStudent = (student: ClassStudentOverview) => {
        latestStudentRequest.current = student.student.id;
        setSelectedStudent(student);
        setLoadingAttempts(true);
        fetchUserMockResults(student.student.id).then((data) => {
            if (latestStudentRequest.current !== student.student.id) return;
            setAttempts(data);
            setLoadingAttempts(false);
        });
    };

    if (!user) return null;

    return (
        <div className="flex flex-col gap-8 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section className="flex flex-wrap items-center gap-2 text-sm">
                <button onClick={() => { setSelectedClass(null); setSelectedStudent(null); }} className={`font-bold tracking-tight ${!selectedClass ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {t("studentResults")}
                </button>
                {selectedClass && (
                    <>
                        <ChevronRight size={15} className="text-muted-foreground" />
                        <button onClick={() => setSelectedStudent(null)} className={`font-bold ${!selectedStudent ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                            {selectedClass.name}
                        </button>
                    </>
                )}
                {selectedStudent && (
                    <>
                        <ChevronRight size={15} className="text-muted-foreground" />
                        <span className="font-bold text-foreground">{selectedStudent.student.name} {selectedStudent.student.surname || ""}</span>
                    </>
                )}
            </section>

            {!selectedClass && (
                <>
                    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--brand-blue-soft))] text-[hsl(var(--brand-blue-ink))]"><Trophy size={22} /></span>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("topClassLabel")}</p>
                                {overview?.topClass ? (
                                    <>
                                        <p className="truncate font-bold text-foreground">{overview.topClass.name}</p>
                                        <p className="text-sm text-muted-foreground">{t("avgResultSuffix").replace("{score}", String(overview.topClass.avgAccuracy))}</p>
                                    </>
                                ) : (
                                    <p className="text-sm text-muted-foreground">{t("noCompletedTestsYet")}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40"><Award size={22} /></span>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("topStudentLabel")}</p>
                                {overview?.topStudent ? (
                                    <>
                                        <p className="truncate font-bold text-foreground">{overview.topStudent.student.name} {overview.topStudent.student.surname || ""}</p>
                                        <p className="text-sm text-muted-foreground">{overview.topStudent.avgAccuracy}% • {overview.topStudent.className}</p>
                                    </>
                                ) : (
                                    <p className="text-sm text-muted-foreground">{t("noCompletedTestsYet")}</p>
                                )}
                            </div>
                        </div>
                    </section>

                    <section>
                        <h2 className="mb-5 text-xl font-bold tracking-tight text-[hsl(var(--brand-blue-ink))]">{t("myGroups")}</h2>
                        {loadingOverview ? (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {[1, 2, 3].map((n) => <div key={n} className="h-28 animate-pulse rounded-2xl border border-border bg-muted" />)}
                            </div>
                        ) : !overview || overview.classes.length === 0 ? (
                            <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                                <Users size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                                <p className="font-medium text-muted-foreground">{t("noGroupsYet")}</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {overview.classes.map((cls) => (
                                    <button key={cls.id} onClick={() => openClass(cls)} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:bg-muted/40">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="font-semibold text-foreground">{cls.name}</p>
                                            <ChevronRight size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                                        </div>
                                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <Users size={12} /> {cls.memberCount} {locale === "ru" ? pluralizeRu(cls.memberCount, ["ученик", "ученика", "учеников"]) : t("studentWord")}
                                        </p>
                                        <span className={`inline-flex w-fit items-center rounded-lg px-2.5 py-1 text-xs font-extrabold tabular-nums ${accuracyColor(cls.avgAccuracy)}`}>
                                            {cls.avgAccuracy !== null ? t("avgResultSuffix").replace("{score}", String(cls.avgAccuracy)) : t("noAttemptsLabel")}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>
                </>
            )}

            {selectedClass && !selectedStudent && (
                <section>
                    <button onClick={() => setSelectedClass(null)} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
                        <ArrowLeft size={15} /> {t("backToGroups")}
                    </button>
                    <div className="mb-5 flex items-center justify-between">
                        <h2 className="text-xl font-bold tracking-tight text-foreground">{selectedClass.name}</h2>
                        <span className="text-sm text-muted-foreground">{students.length} {locale === "ru" ? pluralizeRu(students.length, ["ученик", "ученика", "учеников"]) : t("studentWord")}</span>
                    </div>
                    {loadingStudents ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
                    ) : students.length === 0 ? (
                        <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                            <p className="font-medium text-muted-foreground">{t("noStudentsInGroup")}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {students.map((s) => (
                                <button key={s.student.id} onClick={() => openStudent(s)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:bg-muted/40">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted font-bold text-foreground">
                                            {s.student.name[0]?.toUpperCase() || "?"}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-foreground">{s.student.name} {s.student.surname || ""}</p>
                                            <p className="text-xs text-muted-foreground">{s.attemptCount > 0 ? `${s.attemptCount} ${locale === "ru" ? pluralizeRu(s.attemptCount, ["попытка", "попытки", "попыток"]) : t("attemptWord")}` : t("neverTakenTests")}</p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <span className={`rounded-xl px-3 py-1.5 text-sm font-extrabold tabular-nums ${accuracyColor(s.avgAccuracy)}`}>
                                            {s.avgAccuracy !== null ? `${s.avgAccuracy}%` : "—"}
                                        </span>
                                        <ChevronRight size={16} className="text-muted-foreground" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {selectedStudent && (
                <section>
                    <button onClick={() => setSelectedStudent(null)} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
                        <ArrowLeft size={15} /> {t("backToGroupStudents")}
                    </button>
                    <div className="mb-5 flex items-center gap-4">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted text-xl font-bold text-foreground">
                            {selectedStudent.student.name[0]?.toUpperCase() || "?"}
                        </span>
                        <div className="min-w-0">
                            <h2 className="truncate text-xl font-bold tracking-tight text-foreground">{selectedStudent.student.name} {selectedStudent.student.surname || ""}</h2>
                            <p className="text-sm text-muted-foreground">{selectedStudent.student.shortId} • {selectedClass?.name}</p>
                        </div>
                    </div>
                    {loadingAttempts ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
                    ) : attempts.length === 0 ? (
                        <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                            <p className="font-medium text-muted-foreground">{t("studentNeverTakenMock")}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {attempts.map((a) => (
                                <div key={a.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{a.mock_test_title}</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(a.completed_at).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ", { day: "numeric", month: "long", year: "numeric" })}</span>
                                            <span>{a.correct_answers}/{a.total_questions} {t("correctSuffix")}</span>
                                        </div>
                                    </div>
                                    {/* Балл за конкретный мок — по модели Раша, 0-75.
                                        Средние по классам и ученикам ниже остаются в
                                        процентах: они складывают разные тесты, и только
                                        доля от максимума между ними сопоставима. */}
                                    <div className="flex shrink-0 flex-col items-end gap-0.5 self-start sm:self-auto">
                                        {a.level_score != null ? (
                                            <span className={`rounded-xl px-4 py-2 text-sm font-extrabold tabular-nums ${accuracyColor(certificatePercent(a.level_score, a.level_score_max))}`}>
                                                {a.level_score}
                                            </span>
                                        ) : (
                                            <span className="rounded-xl border border-border bg-muted px-4 py-2 text-[10px] font-semibold text-muted-foreground">
                                                {t("levelPendingShort")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
