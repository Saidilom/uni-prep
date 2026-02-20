"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Class, User } from "@/lib/firestore-schema";
import { SUBJECTS } from "@/lib/constants";
import { findStudentById, addStudentToClass, deleteStudentFromClass, deleteClass, fetchClassStudents } from "@/lib/class-utils";
import { Search, UserPlus, Trash2, ChevronRight, X, Eye } from "lucide-react";
import Link from "next/link";
import Plasma from "@/components/Plasma";

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
                const classRef = doc(db, "classes", id as string);
                const classSnap = await getDoc(classRef);
                if (classSnap.exists()) {
                    const classData = { id: classSnap.id, ...classSnap.data() } as Class;
                    setCls(classData);
                    const studentData = await fetchClassStudents(classData.students);
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
            <div className="relative min-h-[60vh] flex items-center justify-center">
                <div className="fixed inset-0 z-0">
                    <Plasma
                        color="#ffffff"
                        speed={1.0}
                        direction="forward"
                        scale={1.2}
                        opacity={0.9}
                        mouseInteractive={true}
                    />
                </div>
                <div className="relative z-10 w-72 h-12 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl animate-pulse" />
            </div>
        );
    }

    if (!cls) {
        return (
            <div className="relative min-h-[60vh] flex items-center justify-center">
                <div className="fixed inset-0 z-0">
                    <Plasma
                        color="#ffffff"
                        speed={1.0}
                        direction="forward"
                        scale={1.2}
                        opacity={0.9}
                        mouseInteractive={true}
                    />
                </div>
                <div className="relative z-10 px-6 py-10 rounded-3xl bg-white/5 border border-white/15 backdrop-blur-xl text-center shadow-[0_0_40px_rgba(0,0,0,0.35)]">
                    <h2 className="text-2xl font-semibold text-white mb-2">Класс не найден</h2>
                    <p className="text-white/60 text-sm">Проверьте ссылку и попробуйте снова.</p>
                    <Link
                        href="/classes"
                        className="mt-6 inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-white text-neutral-900 text-sm font-semibold hover:bg-neutral-100 active:scale-[0.97] transition-all"
                    >
                        К моим классам
                    </Link>
                </div>
            </div>
        );
    }

    const subject = SUBJECTS.find((s) => s.id === cls.subjectId);

    return (
        <div className="relative flex flex-col gap-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Plasma background */}
            <div className="fixed inset-0 z-0">
                <Plasma
                    color="#ffffff"
                    speed={1.0}
                    direction="forward"
                    scale={1.2}
                    opacity={0.9}
                    mouseInteractive={true}
                />
            </div>

            {/* Breadcrumbs */}
            <nav className="relative z-10 flex items-center gap-2 text-xs sm:text-sm font-medium text-white/40">
                <Link href="/classes" className="hover:text-white transition-colors">
                    Классы
                </Link>
                <ChevronRight size={14} className="text-white/20" />
                <span className="text-white/85">{cls.name}</span>
            </nav>

            {/* Header */}
            <section className="relative z-10">
                <div className="flex items-center gap-4 mb-3">
                    <span className="text-5xl">{subject?.emoji || "📚"}</span>
                    <div className="flex flex-col">
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                            {cls.name}
                        </h1>
                        <span className="text-xs sm:text-sm font-semibold text-white/60 uppercase tracking-[0.18em]">
                            {subject?.name || "Предмет не указан"} • {students.length} учеников
                        </span>
                    </div>
                </div>
            </section>

            {/* Add Student */}
            <section className="relative z-10 p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.35)] overflow-hidden">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                <div className="relative flex items-center justify-between gap-4 mb-6">
                    <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                        Добавить ученика
                    </h2>
                    <span className="text-[10px] uppercase tracking-[0.25em] text-white/45">
                        по короткому ID
                    </span>
                </div>

                <form onSubmit={handleSearch} className="relative flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35" size={18} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Короткий ID ученика (например A1B2C3)"
                            className="w-full pl-12 pr-4 py-3 rounded-2xl bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:bg-white/10 focus:border-white/35 focus:outline-none transition-all"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isSearching}
                        className="inline-flex items-center justify-center px-8 py-3 rounded-2xl bg-white text-neutral-900 text-sm font-semibold shadow-[0_18px_45px_rgba(0,0,0,0.45)] hover:bg-neutral-100 active:scale-[0.97] transition-all disabled:opacity-50"
                    >
                        {isSearching ? "Поиск..." : "Найти"}
                    </button>
                </form>

                {error && (
                    <div className="relative mt-4 text-sm text-red-300 font-medium animate-in fade-in slide-in-from-top-1">
                        {error}
                    </div>
                )}

                {searchResult && (
                    <div className="relative mt-6 p-5 rounded-3xl bg-white/5 border border-white/10 backdrop-blur flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/10 border border-white/20 rounded-2xl flex items-center justify-center text-xl font-bold text-white">
                                {searchResult.name?.[0] || "?"}
                            </div>
                            <div className="flex flex-col">
                                <p className="font-semibold text-white">
                                    {searchResult.name} {searchResult.surname || ""}
                                </p>
                                <p className="text-sm text-white/50">{searchResult.email}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleAddStudent}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-500/90 text-white text-sm font-semibold hover:bg-emerald-500 active:scale-[0.97] transition-all shadow-[0_12px_35px_rgba(0,0,0,0.45)]"
                        >
                            <UserPlus size={18} />
                            <span>Добавить</span>
                        </button>
                    </div>
                )}
            </section>

            {/* Students */}
            <section className="relative z-10">
                <div className="flex items-end justify-between gap-4 mb-6">
                    <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                        Ученики
                    </h2>
                    <span className="text-xs font-bold text-white/60 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 backdrop-blur">
                        {students.length} учеников
                    </span>
                </div>

                {students.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                        {students.map((student) => (
                            <div
                                key={student.id}
                                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.25)] hover:bg-white/8 transition-all"
                            >
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="w-10 h-10 bg-white/10 border border-white/15 rounded-2xl flex items-center justify-center font-bold text-white/80">
                                        {student.name?.[0] || "?"}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-white truncate">
                                            {student.name} {student.surname || ""}
                                        </p>
                                        <p className="text-xs text-white/50 mt-0.5 truncate">{student.email}</p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-3">
                                    <Link
                                        href={`/student/${student.id}`}
                                        className="inline-flex items-center justify-center px-4 py-2 rounded-2xl border border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-all text-sm"
                                        title="Просмотреть профиль"
                                    >
                                        <Eye size={18} className="mr-2" />
                                        Профиль
                                    </Link>
                                    <button
                                        onClick={() => handleDeleteStudent(student.id)}
                                        className="inline-flex items-center justify-center px-4 py-2 rounded-2xl border border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/15 hover:text-red-100 transition-all text-sm"
                                        title="Удалить из класса"
                                    >
                                        <X size={18} className="mr-2" />
                                        Удалить
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-16 px-6 text-center rounded-[2.5rem] border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_15px_45px_rgba(0,0,0,0.35)]">
                        <p className="text-white/60 font-medium">В этом классе пока нет учеников.</p>
                    </div>
                )}
            </section>

            {/* Danger Zone */}
            <section className="relative z-10 pt-2 flex justify-center">
                <button
                    onClick={handleDeleteClass}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl border border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/15 hover:text-red-100 active:scale-[0.97] transition-all text-sm font-semibold"
                >
                    <Trash2 size={16} />
                    Удалить класс
                </button>
            </section>
        </div>
    );
}
