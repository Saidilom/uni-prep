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
    fetchAssignableMockTests,
    assignMockToClass,
    unassignMockFromClass,
    fetchAssignablePlacementTests,
    fetchStudentActivePlacementTestIds,
    assignPlacementToStudent,
    ClassMockAssignment,
    AssignablePlacementTest,
} from "@/lib/class-utils";
import { Class, User, MockTest } from "@/lib/firestore-schema";

export default function ClassDetailPage() {
    const { id } = useParams();
    const classId = id as string;
    const router = useRouter();
    const { user } = useAuthStore();
    const toast = useToast();

    const [cls, setCls] = useState<Class | null>(null);
    const [members, setMembers] = useState<User[]>([]);
    const [assignments, setAssignments] = useState<ClassMockAssignment[]>([]);
    const [loading, setLoading] = useState(true);

    const [searchId, setSearchId] = useState("");
    const [searching, setSearching] = useState(false);
    const [searchResult, setSearchResult] = useState<User | null | "not_found">(null);

    const [assigning, setAssigning] = useState(false);
    const [assignable, setAssignable] = useState<MockTest[]>([]);

    const [placementTarget, setPlacementTarget] = useState<User | null>(null);
    const [placementTests, setPlacementTests] = useState<AssignablePlacementTest[]>([]);
    const [activePlacementIds, setActivePlacementIds] = useState<Set<string>>(new Set());
    const [assigningPlacement, setAssigningPlacement] = useState(false);

    const load = async () => {
        setLoading(true);
        const [c, m, a] = await Promise.all([
            fetchClassById(classId),
            fetchClassMembers(classId),
            fetchClassMockAssignments(classId),
        ]);
        setCls(c);
        setMembers(m);
        setAssignments(a);
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
            toast.success(`${student.name} добавлен(а) в класс`);
            load();
        } catch (err) {
            toast.error("Не удалось добавить ученика", { description: String(err) });
        }
    };

    const handleRemove = async (student: User) => {
        if (!confirm(`Удалить ${student.name} ${student.surname || ""} из класса?`)) return;
        try {
            await removeStudentFromClass(classId, student.id);
            toast.success("Ученик удалён из класса");
            load();
        } catch (err) {
            toast.error("Не удалось удалить ученика", { description: String(err) });
        }
    };

    const handleDeleteClass = async () => {
        if (!confirm(`Удалить класс «${cls?.name}»? Это действие необратимо.`)) return;
        try {
            await deleteClass(classId);
            toast.success("Класс удалён");
            router.push("/classes");
        } catch (err) {
            toast.error("Не удалось удалить класс", { description: String(err) });
        }
    };

    const openAssignPicker = async () => {
        setAssigning(true);
        const all = await fetchAssignableMockTests();
        setAssignable(all.filter((t) => !assignments.some((a) => a.mockTestId === t.id)));
    };

    const handleAssign = async (test: MockTest) => {
        try {
            await assignMockToClass(test.id, classId);
            setAssigning(false);
            toast.success(`«${test.title}» назначен классу`);
            load();
        } catch (err) {
            toast.error("Не удалось назначить тест", { description: String(err) });
        }
    };

    const handleUnassign = async (assignment: ClassMockAssignment) => {
        if (!confirm(`Снять назначение «${assignment.title}»?`)) return;
        try {
            await unassignMockFromClass(assignment.id);
            toast.success("Назначение снято");
            load();
        } catch (err) {
            toast.error("Не удалось снять назначение", { description: String(err) });
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
            toast.success(`«${test.title}» назначен ${placementTarget.name}`);
            setPlacementTarget(null);
        } catch (err) {
            toast.error("Не удалось назначить Placement", { description: String(err) });
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
                <p className="font-medium text-muted-foreground">Класс не найден.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <button onClick={() => router.push("/classes")} className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
                        <ArrowLeft size={14} /> Мои классы
                    </button>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{cls.name}</h1>
                    <p className="mt-2 text-sm text-muted-foreground">{members.length} {members.length === 1 ? "ученик" : "учеников"}</p>
                </div>
                <button
                    onClick={handleDeleteClass}
                    className="inline-flex shrink-0 items-center gap-2 self-start rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950/30"
                >
                    <Trash2 size={16} /> Удалить класс
                </button>
            </section>

            {/* Students */}
            <section>
                <h2 className="mb-5 text-xl font-bold tracking-tight text-foreground sm:text-2xl">Ученики</h2>

                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                    <Search size={16} className="shrink-0 text-muted-foreground" />
                    <input
                        value={searchId}
                        onChange={(e) => { setSearchId(e.target.value); setSearchResult(null); }}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        placeholder="Student ID ученика (STU-XXXXXX)"
                        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                    <button
                        onClick={handleSearch}
                        disabled={searching || searchId.trim().length < 3}
                        className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-all hover:opacity-90 disabled:opacity-50"
                    >
                        {searching ? "Поиск…" : "Найти"}
                    </button>
                </div>

                {searchResult === "not_found" ? (
                    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        Ученик с таким ID не найден.
                    </div>
                ) : searchResult ? (
                    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:bg-emerald-950/30">
                        <div>
                            <p className="font-semibold text-foreground">{searchResult.name} {searchResult.surname || ""}</p>
                            <p className="text-xs text-muted-foreground">{searchResult.shortId}</p>
                        </div>
                        {members.some((m) => m.id === searchResult.id) ? (
                            <span className="text-xs font-semibold text-muted-foreground">Уже в классе</span>
                        ) : (
                            <button
                                onClick={() => handleAdd(searchResult)}
                                className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-all hover:opacity-90"
                            >
                                <UserPlus size={14} /> Добавить
                            </button>
                        )}
                    </div>
                ) : null}

                {members.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">В классе пока нет учеников.</p>
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
                                        <ClipboardCheck size={13} /> Placement
                                    </button>
                                    <button
                                        onClick={() => handleRemove(m)}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                                    >
                                        <UserMinus size={13} /> Удалить
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
                    <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Назначенные Mock-тесты</h2>
                    <button
                        onClick={openAssignPicker}
                        className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
                    >
                        <Plus size={16} /> Назначить тест
                    </button>
                </div>

                {assignments.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <ClipboardList size={24} className="mx-auto mb-2 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">Тесты этому классу ещё не назначены.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {assignments.map((a) => (
                            <Link
                                key={a.id}
                                href={`/classes/${classId}/results/${a.mockTestId}`}
                                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/40"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">{a.title}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {a.durationMinutes} мин • {a.completedCount}/{members.length} прошли — результаты
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnassign(a); }}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                                >
                                    <X size={13} /> Снять
                                </button>
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            {assigning && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setAssigning(false)}>
                    <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-border px-6 py-4">
                            <h3 className="font-bold text-foreground">Назначить тест классу</h3>
                            <button onClick={() => setAssigning(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X size={18} /></button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto p-4">
                            {assignable.length === 0 ? (
                                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                                    Нет доступных тестов типа «Только для класса». Создайте такой тест в админ-панели.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {assignable.map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => handleAssign(t)}
                                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted"
                                        >
                                            <span className="text-sm font-semibold text-foreground">{t.title}</span>
                                            <Plus size={16} className="shrink-0 text-muted-foreground" />
                                        </button>
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
                            <h3 className="font-bold text-foreground">Назначить Placement — {placementTarget.name}</h3>
                            <button onClick={() => setPlacementTarget(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X size={18} /></button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto p-4">
                            {placementTests.filter((t) => !activePlacementIds.has(t.id)).length === 0 ? (
                                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                                    Нет доступных Placement-тестов для назначения — либо их ещё не создали в админ-панели, либо у ученика уже есть активные назначения на все.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {placementTests.filter((t) => !activePlacementIds.has(t.id)).map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => handleAssignPlacement(t)}
                                            disabled={assigningPlacement}
                                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
                                        >
                                            <span className="text-sm font-semibold text-foreground">{t.title}</span>
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
