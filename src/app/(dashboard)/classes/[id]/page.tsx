"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Class, User } from "@/lib/firestore-schema";
import supabase from "@/lib/supabase/client";
import { SUBJECTS } from "@/lib/constants";
import { findStudentById, addStudentToClass, deleteStudentFromClass, deleteClass, fetchClassStudents } from "@/lib/class-utils";
import { Search, UserPlus, Trash2, ChevronRight, X, Eye } from "lucide-react";
import Link from "next/link";

export default function ClassDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [cls, setCls] = useState<Class | null>(null);
    const [students, setStudents] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResult, setSearchResult] = useState<User | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!id) return;
            try {
                const { data: classData } = await supabase.from<Class>("classes").select("*").eq("id", id as string).single();
                if (classData) {
                    setCls(classData);
                    const studentData = await fetchClassStudents(classData.students || []);
                    setStudents(studentData);
                }
            } catch (err) {
                console.error(err);
                setError("Ошибка при загрузке данных класса.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [id]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery) return;
        setIsSearching(true);
        setSearchResult(null);
        setError(null);
        try {
            const student = await findStudentById(searchQuery);
            if (student) {
                setSearchResult(student);
            } else {
                setError("Ученик не найден. Проверьте правильность ID.");
            }
        } catch {
            setError("Ошибка при поиске ученика.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleAddStudent = async () => {
        if (!searchResult || !cls) return;
        if (cls.students.includes(searchResult.id)) {
            setError("Этот ученик уже добавлен в класс.");
            return;
        }
        try {
            await addStudentToClass(cls.id, searchResult.id);
            setStudents((prev) => [...prev, searchResult]);
            setCls((prev) => prev ? { ...prev, students: [...prev.students, searchResult.id] } : null);
            setSearchResult(null);
            setSearchQuery("");
        } catch {
            setError("Ошибка при добавлении ученика.");
        }
    };

    const handleDeleteStudent = async (studentId: string) => {
        if (!cls || !confirm("Вы уверены, что хотите удалить ученика из класса?")) return;
        try {
            await deleteStudentFromClass(cls.id, studentId);
            setStudents((prev) => prev.filter(s => s.id !== studentId));
            setCls((prev) => prev ? { ...prev, students: prev.students.filter(id => id !== studentId) } : null);
        } catch {
            alert("Ошибка при удалении ученика.");
        }
    };

    const handleDeleteClass = async () => {
        if (!cls || !confirm("ВНИМАНИЕ: Вы уверены, что хотите полностью удалить этот класс? Это действие необратимо.")) return;
        try {
            await deleteClass(cls.id);
            router.push("/classes");
        } catch {
            alert("Ошибка при удалении класса.");
        }
    };

    if (isLoading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <div className="h-10 w-72 animate-pulse rounded-2xl bg-muted" />
            </div>
        );
    }

    if (!cls) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <div className="max-w-sm rounded-2xl border border-border bg-card px-8 py-10 text-center">
                    <h2 className="mb-2 text-xl font-semibold text-foreground">Класс не найден</h2>
                    <p className="text-sm text-muted-foreground">Проверьте ссылку и попробуйте снова.</p>
                    <Link
                        href="/classes"
                        className="mt-5 inline-flex items-center justify-center rounded-2xl bg-foreground px-6 py-3 text-sm font-semibold text-background transition-all hover:opacity-90 active:scale-[0.97]"
                    >
                        К моим классам
                    </Link>
                </div>
            </div>
        );
    }

    const subject = SUBJECTS.find((s) => s.id === cls.subjectId);

    return (
        <div className="flex flex-col gap-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">

            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
                <Link href="/classes" className="transition-colors hover:text-foreground">
                    Классы
                </Link>
                <ChevronRight size={14} className="text-muted-foreground/70" />
                <span className="text-foreground">{cls.name}</span>
            </nav>

            {/* Header */}
            <section>
                <div className="flex items-center gap-4 mb-3">
                    <span className="text-5xl">{subject?.emoji || "📚"}</span>
                    <div className="flex flex-col">
                        <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
                            {cls.name}
                        </h1>
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:text-sm">
                            {subject?.name || "Предмет не указан"} • {students.length} учеников
                        </span>
                    </div>
                </div>
            </section>

            {/* Add Student */}
            <section className="rounded-2xl border border-border bg-muted/50 p-7 dark:bg-muted/30">
                <div className="mb-5 flex items-center justify-between gap-4">
                    <h2 className="text-lg font-bold tracking-tight text-foreground">Добавить ученика</h2>
                    <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                        по короткому ID
                    </span>
                </div>

                <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Короткий ID ученика (например A1B2C3)"
                            className="w-full rounded-xl border border-border bg-background py-3 pl-12 pr-4 text-foreground placeholder:text-muted-foreground transition-colors focus:border-border focus:outline-none focus:ring-2 focus:ring-ring/25"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isSearching}
                        className="inline-flex items-center justify-center rounded-xl bg-foreground px-7 py-3 text-sm font-semibold text-background transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                    >
                        {isSearching ? "Поиск..." : "Найти"}
                    </button>
                </form>

                {error && (
                    <div className="mt-3 animate-in fade-in slide-in-from-top-1 text-sm font-medium text-destructive">
                        {error}
                    </div>
                )}

                {searchResult && (
                    <div className="mt-5 flex animate-in fade-in zoom-in flex-col items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 duration-200 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-4">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted font-bold text-foreground">
                                {searchResult.name?.[0] || "?"}
                            </div>
                            <div className="flex flex-col">
                                <p className="font-semibold text-foreground">
                                    {searchResult.name} {searchResult.surname || ""}
                                </p>
                                <p className="text-sm text-muted-foreground">{searchResult.email}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleAddStudent}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-700 active:scale-[0.97] dark:bg-emerald-700 dark:hover:bg-emerald-600"
                        >
                            <UserPlus size={16} />
                            <span>Добавить</span>
                        </button>
                    </div>
                )}
            </section>

            {/* Students */}
            <section>
                <div className="flex items-center justify-between gap-4 mb-5">
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Ученики</h2>
                    <span className="rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        {students.length} учеников
                    </span>
                </div>

                {students.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                        {students.map((student) => (
                            <div
                                key={student.id}
                                className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:bg-muted/40 sm:flex-row sm:items-center"
                            >
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted font-bold text-foreground shadow-sm">
                                        {student.name?.[0] || "?"}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">
                                            {student.name} {student.surname || ""}
                                        </p>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{student.email}</p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-2">
                                    <Link
                                        href={`/student/${student.id}`}
                                        className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm transition-all hover:bg-muted hover:text-foreground"
                                        title="Просмотреть профиль"
                                    >
                                        <Eye size={16} className="mr-2" />
                                        Профиль
                                    </Link>
                                    <button
                                        onClick={() => handleDeleteStudent(student.id)}
                                        className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 transition-all hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
                                        title="Удалить из класса"
                                    >
                                        <X size={16} className="mr-2" />
                                        Удалить
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-2xl border border-border bg-muted/50 px-6 py-16 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">В этом классе пока нет учеников.</p>
                    </div>
                )}
            </section>

            {/* Danger Zone */}
            <section className="flex justify-center pt-2">
                <button
                    onClick={handleDeleteClass}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-6 py-3 text-sm font-semibold text-red-600 transition-all hover:bg-red-100 active:scale-[0.97] dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
                >
                    <Trash2 size={16} />
                    Удалить класс
                </button>
            </section>
        </div>
    );
}
