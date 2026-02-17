"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useAuthStore } from "@/store/useAuthStore";
import { Class } from "@/lib/firestore-schema";
import { SUBJECTS } from "@/lib/constants";
import { fetchStudentClasses, fetchUserRatings } from "@/lib/profile-utils";
import { logOut, updateUserProfile } from "@/lib/auth-utils";
import { Star, LogOut, ShieldCheck, User as UserIcon, Copy, Check, Settings2, X } from "lucide-react";

export default function ProfilePage() {
    const { user, setUser } = useAuthStore();
    const [classes, setClasses] = useState<Class[]>([]);
    const [ratings, setRatings] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    // Modal state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newSurname, setNewSurname] = useState("");
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        if (user?.id) {
            setNewName(user.name);
            setNewSurname(user.surname || "");
            Promise.all([
                fetchStudentClasses(user.id),
                fetchUserRatings(user.id)
            ]).then(([classesData, ratingsData]) => {
                setClasses(classesData);
                setRatings(ratingsData);
                setIsLoading(false);
            });
        }
    }, [user]);

    const copyId = () => {
        if (!user) return;
        navigator.clipboard.writeText(user.shortId || user.id);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || newName.length < 2) return;

        try {
            setIsUpdating(true);
            const updatedUser = await updateUserProfile(user.id, {
                name: newName,
                surname: newSurname
            });
            setUser(updatedUser);
            setIsEditModalOpen(false);
        } catch (error) {
            alert("Ошибка при обновлении профиля");
        } finally {
            setIsUpdating(false);
        }
    };

    if (!user) return null;

    return (
        <div className="flex flex-col gap-24">
            {/* Header / Info Section */}
            <section className="flex flex-col md:flex-row gap-12 items-start md:items-center justify-between">
                <div className="flex items-center gap-8">
                    <div className="w-24 h-24 bg-neutral-900 rounded-[2rem] flex items-center justify-center text-white text-4xl font-bold shadow-2xl relative group">
                        {user.name[0]}
                        <div className="absolute inset-0 bg-black/40 rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={() => setIsEditModalOpen(true)}>
                            <Settings2 size={24} />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight text-neutral-900">
                            {user.name} {user.surname || ""}
                        </h1>
                        <div className="flex flex-col gap-3 mt-4">
                            <div className="flex items-center gap-4">
                                <span className="flex items-center gap-1.5 text-[10px] bg-neutral-900 px-3 py-1 rounded-full text-white font-bold uppercase tracking-widest">
                                    <ShieldCheck size={12} />
                                    {user.role === "teacher" ? "Учитель" : "Ученик"}
                                </span>
                                <p className="text-neutral-400 text-sm font-medium">{user.email}</p>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2 p-1.5 bg-neutral-50 border border-neutral-100 rounded-xl self-start">
                                    <code className="text-sm text-neutral-900 font-mono font-bold tracking-widest px-2 group-hover:text-blue-600 transition-colors">
                                        ID: {user.shortId || user.id}
                                    </code>
                                    <button
                                        onClick={copyId}
                                        className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-neutral-200 transition-all text-neutral-400 hover:text-neutral-900"
                                        title="Копировать ID"
                                    >
                                        {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                                    </button>
                                </div>
                                <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider ml-2">
                                    Передайте этот ID учителю для добавления в класс
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setIsEditModalOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 border border-neutral-200 rounded-xl text-neutral-700 font-semibold hover:bg-neutral-50 transition-all active:scale-[0.98]"
                    >
                        <Settings2 size={18} />
                        Изменить профиль
                    </button>
                    <button
                        onClick={() => logOut()}
                        className="flex items-center gap-2 px-6 py-3 bg-red-50 border border-red-100 rounded-xl text-red-600 font-semibold hover:bg-red-100 transition-all active:scale-[0.98]"
                    >
                        <LogOut size={18} />
                        Выйти
                    </button>
                </div>
            </section>

            {/* Edit Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-8">
                                <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Редактировать профиль.</h2>
                                <button onClick={() => setIsEditModalOpen(false)} className="text-neutral-400 hover:text-neutral-900 transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleUpdateProfile} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Имя</label>
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl focus:border-neutral-900 focus:outline-none transition-colors font-medium text-neutral-900"
                                        placeholder="Иван"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Фамилия</label>
                                    <input
                                        type="text"
                                        value={newSurname}
                                        onChange={(e) => setNewSurname(e.target.value)}
                                        className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl focus:border-neutral-900 focus:outline-none transition-colors font-medium text-neutral-900"
                                        placeholder="Петров"
                                    />
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setIsEditModalOpen(false)}
                                        className="flex-1 py-4 border border-neutral-200 text-neutral-600 rounded-2xl font-bold hover:bg-neutral-50 transition-all"
                                    >
                                        Отмена
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isUpdating || newName.length < 2}
                                        className="flex-1 py-4 bg-neutral-900 text-white rounded-2xl font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                                    >
                                        {isUpdating ? "Сохранение..." : "Сохранить"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Classes Section (For Students) */}
            {user.role === "student" && (
                <section>
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-semibold text-neutral-900 tracking-tight">Мои классы.</h2>
                        <span className="text-sm text-neutral-400">{classes.length} групп</span>
                    </div>

                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {[1, 2].map(n => <div key={n} className="h-32 bg-neutral-50 rounded-xl animate-pulse" />)}
                        </div>
                    ) : classes.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {classes.map((cls) => {
                                const subject = SUBJECTS.find(s => s.id === cls.subjectId);
                                return (
                                    <div key={cls.id} className="p-6 bg-white border border-neutral-200 rounded-xl flex items-center justify-between shadow-sm">
                                        <div className="flex items-center gap-4">
                                            <span className="text-3xl">{subject?.emoji || "📚"}</span>
                                            <div>
                                                <h3 className="font-semibold text-neutral-900">{cls.name}</h3>
                                                <p className="text-sm text-neutral-500">{subject?.name}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-12 text-center rounded-2xl border-2 border-dashed border-neutral-100 text-neutral-400 font-medium">
                            Вы еще не состоите ни в одном классе.
                        </div>
                    )}
                </section>
            )}

            {/* Subject Ratings Section */}
            <section>
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-semibold text-neutral-900 tracking-tight">Прогресс по предметам.</h2>
                    <p className="text-sm text-neutral-400">Звезды, полученные за решение тем</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                    {SUBJECTS.map((subject) => {
                        const stars = ratings[subject.id] || 0;
                        return (
                            <div
                                key={subject.id}
                                className="p-6 bg-white border border-neutral-200 rounded-xl flex flex-col items-center gap-4 shadow-sm transition-all hover:border-neutral-400 text-center"
                            >
                                <span className="text-4xl filter grayscale-[0.5] group-hover:grayscale-0">{subject.emoji}</span>
                                <span className="text-sm font-semibold text-neutral-900 tracking-tight truncate w-full">
                                    {subject.name}
                                </span>
                                <div className="flex items-center gap-1">
                                    {[1, 2, 3].map((star) => (
                                        <Star
                                            key={star}
                                            size={14}
                                            className={star <= Math.min(stars, 3) ? "fill-yellow-400 text-yellow-400" : "text-neutral-200"}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Engineering Footer Info */}
            <section className="mt-12 py-12 border-t border-neutral-100 flex flex-col items-center">
                <div className="relative w-24 h-12 overflow-hidden mb-4 opacity-50 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-500">
                    <Image
                        src="/logo.png"
                        alt="Uni-Prep Logo"
                        fill
                        className="object-contain"
                    />
                </div>
            
            </section>
        </div>
    );
}
