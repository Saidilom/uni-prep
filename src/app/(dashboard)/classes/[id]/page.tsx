"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, UserPlus, UserMinus, Trash2, Plus, ClipboardList, ClipboardCheck, X } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/useToast";
import {
    fetchClassById,
    fetchClassMembers,
    findStudentByShortId,
    addStudentToClass,
    removeStudentFromClass,
    deleteClass,
    fetchClassMockAssignments,
    fetchClassStudentMockAssignments,
    fetchAssignableMockTests,
    assignMockToClass,
    unassignMockFromClass,
    unassignMockFromStudent,
    fetchAssignablePlacementTests,
    fetchStudentActivePlacementTestIds,
    assignPlacementToStudent,
    ClassMockAssignment,
    ClassStudentMockAssignment,
    AssignablePlacementTest,
} from "@/lib/class-utils";
import { Class, User, MockTest } from "@/lib/firestore-schema";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

export default function ClassDetailPage() {
    const { id } = useParams();
    const classId = id as string;
    const router = useRouter();
    const { user } = useAuthStore();
    const { locale } = useLocale();
    const t = useTranslations("classDetail");
    const toast = useToast();

    const [cls, setCls] = useState<Class | null>(null);
    const [members, setMembers] = useState<User[]>([]);
    const [assignments, setAssignments] = useState<ClassMockAssignment[]>([]);
    const [studentAssignments, setStudentAssignments] = useState<ClassStudentMockAssignment[]>([]);
    const [loading, setLoading] = useState(true);

    const [searchId, setSearchId] = useState("");
    const [searching, setSearching] = useState(false);
    const [searchResult, setSearchResult] = useState<User | null | "not_found">(null);

    const [assigning, setAssigning] = useState(false);
    const [assignable, setAssignable] = useState<MockTest[]>([]);
    const [assignStudentTarget, setAssignStudentTarget] = useState<MockTest | null>(null);
    const [assigningToStudent, setAssigningToStudent] = useState<string | null>(null);

    const [placementTarget, setPlacementTarget] = useState<User | null>(null);
    const [placementTests, setPlacementTests] = useState<AssignablePlacementTest[]>([]);
    const [activePlacementIds, setActivePlacementIds] = useState<Set<string>>(new Set());
    const [assigningPlacement, setAssigningPlacement] = useState(false);

    const load = async () => {
        setLoading(true);
        const [c, m, a, sa] = await Promise.all([
            fetchClassById(classId),
            fetchClassMembers(classId),
            fetchClassMockAssignments(classId),
            fetchClassStudentMockAssignments(classId),
        ]);
        setCls(c);
        setMembers(m);
        setAssignments(a);
        setStudentAssignments(sa);
        setLoading(false);
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [classId]);

    const handleSearch = async () => {
        if (searchId.trim().length < 3) return;
        setSearching(true);
        setSearchResult(null);
        try {
            const student = await findStudentByShortId(searchId);
            setSearchResult(student || "not_found");
        } finally {
            setSearching(false);
        }
    };

    const handleAdd = async (student: User) => {
        try {
            await addStudentToClass(classId, student.id);
            setSearchId("");
            setSearchResult(null);
            toast.success(t("studentAddedToast").replace("{name}", student.name));
            load();
        } catch (err) {
            toast.error(t("addStudentFailed"), { description: String(err) });
        }
    };

    const handleRemove = async (student: User) => {
        if (!confirm(t("removeConfirm").replace("{name}", `${student.name} ${student.surname || ""}`))) return;
        try {
            await removeStudentFromClass(classId, student.id);
            toast.success(t("studentRemovedToast"));
            load();
        } catch (err) {
            toast.error(t("removeStudentFailed"), { description: String(err) });
        }
    };

    const handleDeleteClass = async () => {
        if (!confirm(t("deleteClassConfirm").replace("{name}", cls?.name ?? ""))) return;
        try {
            await deleteClass(classId);
            toast.success(t("classDeletedToast"));
            router.push("/classes");
        } catch (err) {
            toast.error(t("deleteClassFailed"), { description: String(err) });
        }
    };

    const openAssignPicker = async () => {
        setAssigning(true);
        setAssignStudentTarget(null);
        if (!user) return;
        const all = await fetchAssignableMockTests(user.id);
        // A test already assigned here — to the whole class or to any one
        // student — is considered "handled" for this class and drops out of
        // the picker, the same way a class-wide assignment already did.
        const assignedIds = new Set([
            ...assignments.map((a) => a.mockTestId),
            ...studentAssignments.map((a) => a.mockTestId),
        ]);
        setAssignable(all.filter((t) => !assignedIds.has(t.id)));
    };

    const handleAssign = async (test: MockTest) => {
        try {
            await assignMockToClass(test.id, classId);
            setAssigning(false);
            toast.success(t("assignedToClassToast").replace("{title}", test.title));
            load();
        } catch (err) {
            toast.error(t("assignTestFailed"), { description: String(err) });
        }
    };

    const handleAssignToStudent = async (test: MockTest, student: User) => {
        setAssigningToStudent(student.id);
        try {
            const response = await fetch(`/api/mock-tests/${test.id}/assign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetType: "student", targetId: student.id }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || t("assignTestFailed"));
            toast.success(t("assignedToStudentToast").replace("{title}", test.title).replace("{name}", student.name));
            setAssigning(false);
            setAssignStudentTarget(null);
            load();
        } catch (err) {
            toast.error(t("assignTestFailed"), { description: err instanceof Error ? err.message : String(err) });
        } finally {
            setAssigningToStudent(null);
        }
    };

    const handleUnassign = async (assignment: ClassMockAssignment) => {
        if (!confirm(t("unassignConfirm").replace("{title}", assignment.title))) return;
        try {
            await unassignMockFromClass(assignment.id, classId);
            toast.success(t("unassignedToast"));
            load();
        } catch (err) {
            toast.error(t("unassignFailed"), { description: String(err) });
        }
    };

    const handleUnassignFromStudent = async (assignment: ClassStudentMockAssignment) => {
        if (!confirm(t("unassignFromStudentConfirm").replace("{title}", assignment.title).replace("{student}", assignment.studentName))) return;
        try {
            await unassignMockFromStudent(assignment.id, classId);
            toast.success(t("unassignedToast"));
            load();
        } catch (err) {
            toast.error(t("unassignFailed"), { description: String(err) });
        }
    };

    const openPlacementPicker = async (student: User) => {
        setPlacementTarget(student);
        const [tests, activeIds] = await Promise.all([
            fetchAssignablePlacementTests(),
            fetchStudentActivePlacementTestIds(student.id),
        ]);
        setPlacementTests(tests);
        setActivePlacementIds(activeIds);
    };

    const handleAssignPlacement = async (test: AssignablePlacementTest) => {
        if (!placementTarget || !user) return;
        setAssigningPlacement(true);
        try {
            await assignPlacementToStudent(test, placementTarget.id, user.id);
            toast.success(t("assignedToStudentToast").replace("{title}", test.title).replace("{name}", placementTarget.name));
            setPlacementTarget(null);
        } catch (err) {
            toast.error(t("assignPlacementFailed"), { description: String(err) });
        } finally {
            setAssigningPlacement(false);
        }
    };

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
            <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <button onClick={() => router.push("/classes")} className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
                        <ArrowLeft size={14} /> {t("myGroups")}
                    </button>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{cls.name}</h1>
                    <p className="mt-2 text-sm text-muted-foreground">{members.length} {locale === "ru" ? (members.length === 1 ? t("studentWordSingular") : t("studentWordPlural")) : t("studentWordSingular")}</p>
                </div>
                <button
                    onClick={handleDeleteClass}
                    className="inline-flex shrink-0 items-center gap-2 self-start rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950/30"
                >
                    <Trash2 size={16} /> {t("deleteGroup")}
                </button>
            </section>

            {/* Students */}
            <section>
                <h2 className="mb-5 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t("studentsSection")}</h2>

                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                    <Search size={16} className="shrink-0 text-muted-foreground" />
                    <input
                        value={searchId}
                        onChange={(e) => { setSearchId(e.target.value); setSearchResult(null); }}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        placeholder={t("searchPlaceholder")}
                        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                    <button
                        onClick={handleSearch}
                        disabled={searching || searchId.trim().length < 3}
                        className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-all hover:opacity-90 disabled:opacity-50"
                    >
                        {searching ? t("searching") : t("find")}
                    </button>
                </div>

                {searchResult === "not_found" ? (
                    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        {t("studentNotFound")}
                    </div>
                ) : searchResult ? (
                    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:bg-emerald-950/30">
                        <div>
                            <p className="font-semibold text-foreground">{searchResult.name} {searchResult.surname || ""}</p>
                            <p className="text-xs text-muted-foreground">{searchResult.shortId}</p>
                        </div>
                        {members.some((m) => m.id === searchResult.id) ? (
                            <span className="text-xs font-semibold text-muted-foreground">{t("alreadyInGroup")}</span>
                        ) : (
                            <button
                                onClick={() => handleAdd(searchResult)}
                                className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-all hover:opacity-90"
                            >
                                <UserPlus size={14} /> {t("add")}
                            </button>
                        )}
                    </div>
                ) : null}

                {members.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">{t("noStudentsInGroup")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {members.map((m) => (
                            <div key={m.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted font-bold text-foreground">
                                        {m.name[0]?.toUpperCase() || "?"}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">{m.name} {m.surname || ""}</p>
                                        <p className="font-mono text-xs text-muted-foreground">{m.shortId}</p>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <button
                                        onClick={() => openPlacementPicker(m)}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
                                    >
                                        <ClipboardCheck size={13} /> {t("schoolLabel")}
                                    </button>
                                    <button
                                        onClick={() => handleRemove(m)}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                                    >
                                        <UserMinus size={13} /> {t("remove")}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Assigned mocks */}
            <section>
                <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t("assignedMockTests")}</h2>
                    <button
                        onClick={openAssignPicker}
                        className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
                    >
                        <Plus size={16} /> {t("assignTest")}
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div>
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("wholeGroup")}</h3>
                        {assignments.length === 0 ? (
                            <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                                <ClipboardList size={24} className="mx-auto mb-2 text-muted-foreground/50" />
                                <p className="font-medium text-muted-foreground">{t("noGroupTestsYet")}</p>
                            </div>
                        ) : (
                            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                                {assignments.map((a) => (
                                    <Link
                                        key={a.id}
                                        href={`/classes/${classId}/results/${a.mockTestId}`}
                                        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/40"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-foreground">{a.title}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                {t("durationCompletedTemplate").replace("{duration}", String(a.durationMinutes)).replace("{completed}", String(a.completedCount)).replace("{total}", String(members.length))}
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnassign(a); }}
                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                                        >
                                            <X size={13} /> {t("unassign")}
                                        </button>
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
                            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                                {studentAssignments.map((a) => (
                                    <div key={a.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-foreground">{a.title}</p>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                {t("studentDurationCompletedTemplate").replace("{student}", a.studentName).replace("{duration}", String(a.durationMinutes)).replace("{status}", a.completed ? t("completedWord") : t("notCompletedWord"))}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleUnassignFromStudent(a)}
                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                                        >
                                            <X size={13} /> {t("unassign")}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {assigning && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => { setAssigning(false); setAssignStudentTarget(null); }}>
                    <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
                            {assignStudentTarget && (
                                <button onClick={() => setAssignStudentTarget(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><ArrowLeft size={16} /></button>
                            )}
                            <h3 className="min-w-0 flex-1 truncate font-bold text-foreground">
                                {assignStudentTarget ? t("assignToStudentModalTitle").replace("{title}", assignStudentTarget.title) : t("assignToGroupModalTitle")}
                            </h3>
                            <button onClick={() => { setAssigning(false); setAssignStudentTarget(null); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X size={18} /></button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto p-4">
                            {assignStudentTarget ? (
                                members.length === 0 ? (
                                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("noStudentsInGroup")}</p>
                                ) : (
                                    <div className="space-y-2">
                                        {members.map((student) => (
                                            <button
                                                key={student.id}
                                                onClick={() => handleAssignToStudent(assignStudentTarget, student)}
                                                disabled={assigningToStudent === student.id}
                                                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
                                            >
                                                <span className="text-sm font-semibold text-foreground">{student.name} {student.surname || ""}</span>
                                                {assigningToStudent === student.id ? (
                                                    <span className="shrink-0 text-xs font-semibold text-muted-foreground">{t("assigningLabel")}</span>
                                                ) : (
                                                    <Plus size={16} className="shrink-0 text-muted-foreground" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )
                            ) : assignable.length === 0 ? (
                                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                                    {t("noClassOnlyTests")}
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {assignable.map((mockTest) => (
                                        <div key={mockTest.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3">
                                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{mockTest.title}</span>
                                            <div className="flex shrink-0 items-center gap-2">
                                                <button onClick={() => setAssignStudentTarget(mockTest)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted">{t("toStudentButton")}</button>
                                                <button onClick={() => handleAssign(mockTest)} className="inline-flex items-center gap-1 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90">
                                                    {t("toAllButton")} <Plus size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {placementTarget && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setPlacementTarget(null)}>
                    <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-border px-6 py-4">
                            <h3 className="font-bold text-foreground">{t("assignPlacementModalTitle").replace("{name}", placementTarget.name)}</h3>
                            <button onClick={() => setPlacementTarget(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X size={18} /></button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto p-4">
                            {placementTests.filter((pt) => !activePlacementIds.has(pt.id)).length === 0 ? (
                                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                                    {t("noPlacementTestsAvailable")}
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {placementTests.filter((pt) => !activePlacementIds.has(pt.id)).map((pt) => (
                                        <button
                                            key={pt.id}
                                            onClick={() => handleAssignPlacement(pt)}
                                            disabled={assigningPlacement}
                                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
                                        >
                                            <span className="text-sm font-semibold text-foreground">{pt.title}</span>
                                            <Plus size={16} className="shrink-0 text-muted-foreground" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
