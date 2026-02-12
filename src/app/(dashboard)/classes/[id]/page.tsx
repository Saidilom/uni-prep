"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Class, User } from "@/lib/firestore-schema";
import { SUBJECTS } from "@/lib/constants";
import { findStudentById, addStudentToClass, deleteStudentFromClass, deleteClass, fetchClassStudents } from "@/lib/class-utils";
import { Search, UserPlus, Trash2, ArrowLeft, X, Eye } from "lucide-react";
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
        } catch (err) {
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
        } catch (err) {
            setError("Ошибка при добавлении ученика.");
        }
    };

    const handleDeleteStudent = async (studentId: string) => {
        if (!cls || !confirm("Вы уверены, что хотите удалить ученика из класса?")) return;
        try {
            await deleteStudentFromClass(cls.id, studentId);
            setStudents((prev) => prev.filter(s => s.id !== studentId));
            setCls((prev) => prev ? { ...prev, students: prev.students.filter(id => id !== studentId) } : null);
        } catch (err) {
            alert("Ошибка при удалении ученика.");
        }
    };

    const handleDeleteClass = async () => {
        if (!cls || !confirm("ВНИМАНИЕ: Вы уверены, что хотите полностью удалить этот класс? Это действие необратимо.")) return;
        try {
            await deleteClass(cls.id);
            router.push("/classes");
        } catch (err) {
            alert("Ошибка при удалении класса.");
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="w-8 h-1 bg-neutral-200 rounded-full overflow-hidden">
                    <div className="h-full bg-neutral-900 animate-pulse"></div>
                </div>
            </div>
        );
    }

    if (!cls) return <div className="py-24 text-center">Class not found.</div>;

    const subject = SUBJECTS.find((s) => s.id === cls.subjectId);

    return (
        <div className="flex flex-col gap-12">
            {/* Back Link */}
            <Link
                href="/classes"
                className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
            >
                <ArrowLeft size={16} />
                Назад к моим классам
            </Link>

            {/* Header */}
            <section>
                <div className="flex items-center gap-4 mb-4">
                    <span className="text-5xl">{subject?.emoji || "📚"}</span>
                    <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">
                        {cls.name}.
                    </h1>
                </div>
                <p className="text-neutral-500 leading-relaxed max-w-2xl">
                    Управление учениками для вашего класса по предмету {subject?.name.toLowerCase()}. Добавляйте учеников по их короткому ID, чтобы отслеживать их прогресс.
                </p>
            </section>

            {/* Add Student Form */}
            <section className="bg-neutral-50 border border-neutral-200 rounded-2xl p-8">
                <h3 className="text-lg font-semibold text-neutral-900 mb-6 tracking-tight">Добавить ученика.</h3>
                <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Введите короткий ID ученика (напр. A1B2C3)..."
                            className="w-full pl-12 pr-4 py-3 bg-white border border-neutral-200 rounded-xl focus:border-neutral-900 focus:outline-none transition-colors"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isSearching}
                        className="px-8 py-3 bg-neutral-900 text-white rounded-xl font-medium hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        {isSearching ? "Поиск..." : "Найти ученика"}
                    </button>
                </form>

                {error && (
                    <p className="mt-4 text-sm text-red-600 font-medium italic animate-in fade-in slide-in-from-top-1">
                        {error}
                    </p>
                )}

                {searchResult && (
                    <div className="mt-8 p-6 bg-white border border-neutral-200 rounded-xl flex items-center justify-between animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-neutral-900 rounded-2xl flex items-center justify-center text-xl font-bold text-white">
                                {searchResult.name[0]}
                            </div>
                            <div>
                                <p className="font-semibold text-neutral-900">
                                    {searchResult.name} {searchResult.surname || ""}
                                </p>
                                <p className="text-sm text-neutral-500">{searchResult.email}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleAddStudent}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 active:scale-[0.95] transition-all"
                        >
                            <UserPlus size={18} />
                            <span>Добавить в класс</span>
                        </button>
                    </div>
                )}
            </section>

            {/* Students List */}
            <section>
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Ученики.</h2>
                    <span className="text-sm font-medium text-neutral-400">{students.length} учеников</span>
                </div>

                {students.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                        {students.map((student) => (
                            <div
                                key={student.id}
                                className="flex items-center justify-between p-6 bg-white border border-neutral-200 rounded-xl hover:border-neutral-300 transition-all group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-neutral-50 rounded-lg flex items-center justify-center font-bold text-neutral-400">
                                        {student.name[0]}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-neutral-900">
                                            {student.name} {student.surname || ""}
                                        </p>
                                        <p className="text-xs text-neutral-500 mt-0.5">{student.email}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="text-right hidden sm:block">
                                        <p className="text-xs text-neutral-400 uppercase font-bold tracking-widest leading-none">Роль</p>
                                        <p className="text-sm text-neutral-600 mt-1 capitalize font-medium">Ученик</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Link
                                            href={`/student/${student.id}`}
                                            className="p-2 text-neutral-300 hover:text-neutral-900 hover:bg-neutral-50 rounded-lg transition-all"
                                            title="Просмотреть профиль"
                                        >
                                            <Eye size={20} />
                                        </Link>
                                        <button
                                            onClick={() => handleDeleteStudent(student.id)}
                                            className="p-2 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                            title="Удалить из класса"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-24 text-center rounded-2xl border-2 border-dashed border-neutral-100">
                        <p className="text-neutral-400 font-medium">В этом классе пока нет учеников.</p>
                    </div>
                )}
            </section>

            {/* Danger Zone */}
            <section className="mt-12 pt-12 border-t border-neutral-100 flex justify-center">
                <button
                    onClick={handleDeleteClass}
                    className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                >
                    <Trash2 size={16} />
                    Удалить класс
                </button>
            </section>
        </div>
    );
}
