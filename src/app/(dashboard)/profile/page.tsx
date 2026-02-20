"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useAuthStore } from "@/store/useAuthStore";
import { Class, Subject } from "@/lib/firestore-schema";
import { SUBJECTS } from "@/lib/constants";
import { fetchStudentClasses, fetchUserRatings } from "@/lib/profile-utils";
import { fetchSubjects, fetchTextbooksBySubject, fetchTopicsByTextbook } from "@/lib/data-fetching";
import { fetchSubjectProgress } from "@/lib/stats-utils";
import { logOut, updateUserProfile } from "@/lib/auth-utils";
import { Star, LogOut, ShieldCheck, Copy, Check, Settings2, X } from "lucide-react";
import Plasma from "@/components/Plasma";

export default function ProfilePage() {
    const { user, setUser } = useAuthStore();
    const [classes, setClasses] = useState<Class[]>([]);
    const [ratings, setRatings] = useState<Record<string, number>>({});
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [subjectProgress, setSubjectProgress] = useState<Record<string, { progress: number; medals: { green: number; grey: number; bronze: number } }>>({});
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

            const loadData = async () => {
                const [classesData, ratingsData, subjectsData] = await Promise.all([
                    fetchStudentClasses(user.id),
                    fetchUserRatings(user.id),
                    fetchSubjects(),
                ]);
                setClasses(classesData);
                setRatings(ratingsData);
                setSubjects(subjectsData);

                // Load real progress per subject
                const progressMap: Record<string, { progress: number; medals: { green: number; grey: number; bronze: number } }> = {};
                for (const subject of subjectsData) {
                    const textbooks = await fetchTextbooksBySubject(subject.id);
                    const allTopicIds: string[] = [];
                    for (const textbook of textbooks) {
                        const topics = await fetchTopicsByTextbook(textbook.id);
                        allTopicIds.push(...topics.map((t: any) => t.id));
                    }
                    const progress = await fetchSubjectProgress(user.id, subject.id, allTopicIds);
                    progressMap[subject.id] = progress;
                }
                setSubjectProgress(progressMap);
                setIsLoading(false);
            };

            loadData();
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
        <div className="relative flex flex-col gap-16 py-16 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* Plasma background */}
            <div className="fixed inset-0 z-0">
                <Plasma color="#ffffff" speed={1.0} direction="forward" scale={1.2} opacity={0.9} mouseInteractive={true} />
            </div>
            {/* Hero Profile Section */}
            <section className="relative z-10 pt-8 flex flex-col items-center text-center gap-5">
                {/* Large Avatar */}
                <div
                    className="relative w-28 h-28 sm:w-36 sm:h-36 flex-shrink-0 cursor-pointer group"
                    onClick={() => setIsEditModalOpen(true)}
                >
                    {/* Glow ring */}
                    <div className="absolute inset-0 rounded-[2rem] sm:rounded-[2.5rem] bg-white/20 blur-xl scale-110 opacity-60 group-hover:opacity-90 transition-opacity" />
                    {/* Avatar card */}
                    <div className="relative w-full h-full bg-white/10 border border-white/25 rounded-[2rem] sm:rounded-[2.5rem] flex items-center justify-center text-white text-5xl sm:text-6xl font-bold backdrop-blur-xl shadow-2xl overflow-hidden">
                        {user.name[0].toUpperCase()}
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Settings2 size={28} className="text-white" />
                        </div>
                    </div>
                </div>

                {/* Name */}
                <div className="flex flex-col items-center gap-1">
                    <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
                        {user.name} {user.surname || ""}
                    </h1>
                    {/* Role badge */}
                    <span className="flex items-center gap-1.5 text-[10px] bg-white/10 border border-white/15 px-3 py-1 rounded-full text-white font-bold uppercase tracking-widest backdrop-blur mt-1">
                        <ShieldCheck size={11} />
                        {user.role === "teacher" ? "Учитель" : "Ученик"}
                    </span>
                </div>

                {/* Email */}
                <p className="text-white/40 text-sm -mt-2">{user.email}</p>

                {/* ID + Edit row */}
                <div className="flex flex-wrap items-center justify-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-xl backdrop-blur">
                        <code className="text-xs text-white/60 font-mono font-bold tracking-wider">
                            ID: {user.shortId || user.id}
                        </code>
                        <button
                            onClick={copyId}
                            className="p-1 hover:bg-white/10 rounded-lg transition-all text-white/40 hover:text-white"
                            title="Копировать ID"
                        >
                            {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                        </button>
                    </div>

                    <button
                        onClick={() => setIsEditModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white/60 font-semibold hover:bg-white/10 hover:text-white transition-all active:scale-[0.98] backdrop-blur text-sm"
                    >
                        <Settings2 size={14} />
                        Изменить профиль
                    </button>
                </div>
            </section>


            {/* Edit Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-md bg-white/10 border border-white/15 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-8">
                                <h2 className="text-2xl font-bold text-white tracking-tight">Редактировать профиль</h2>
                                <button onClick={() => setIsEditModalOpen(false)} className="text-white/40 hover:text-white transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleUpdateProfile} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest ml-1">Имя</label>
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl focus:border-white/30 focus:outline-none transition-colors font-medium text-white placeholder:text-white/20"
                                        placeholder="Иван"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest ml-1">Фамилия</label>
                                    <input
                                        type="text"
                                        value={newSurname}
                                        onChange={(e) => setNewSurname(e.target.value)}
                                        className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl focus:border-white/30 focus:outline-none transition-colors font-medium text-white placeholder:text-white/20"
                                        placeholder="Петров"
                                    />
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setIsEditModalOpen(false)}
                                        className="flex-1 py-4 border border-white/10 text-white/60 rounded-2xl font-bold hover:bg-white/5 transition-all"
                                    >
                                        Отмена
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isUpdating || newName.length < 2}
                                        className="flex-1 py-4 bg-white text-black rounded-2xl font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
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
                <section className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-white tracking-tight">Мои классы</h2>
                        <span className="text-sm text-white/40">{classes.length} групп</span>
                    </div>

                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[1, 2].map(n => <div key={n} className="h-24 bg-white/5 rounded-2xl animate-pulse border border-white/10" />)}
                        </div>
                    ) : classes.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {classes.map((cls) => {
                                const subject = SUBJECTS.find(s => s.id === cls.subjectId);
                                return (
                                    <div key={cls.id} className="p-5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl flex items-center gap-4">
                                        <span className="text-3xl">{subject?.emoji || "📚"}</span>
                                        <div>
                                            <h3 className="font-semibold text-white">{cls.name}</h3>
                                            <p className="text-sm text-white/40">{subject?.name}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-12 text-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur text-white/40 font-medium">
                            Вы еще не состоите ни в одном классе.
                        </div>
                    )}
                </section>
            )}

            {/* Subject Progress Section */}
            <section className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-white tracking-tight">Прогресс по предметам</h2>
                    <p className="text-sm text-white/40">% пройденных тем</p>
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6].map(n => <div key={n} className="h-28 bg-white/5 rounded-2xl animate-pulse border border-white/10" />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {subjects.map((subject) => {
                            const prog = subjectProgress[subject.id];
                            const pct = prog?.progress ?? 0;
                            const medals = prog?.medals ?? { green: 0, grey: 0, bronze: 0 };
                            const stars = ratings[subject.id] || 0;
                            return (
                                <div
                                    key={subject.id}
                                    className="p-5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl flex flex-col gap-3 hover:bg-white/8 transition-all"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">{subject.emoji}</span>
                                        <span className="text-sm font-bold text-white tracking-tight flex-1 truncate">{subject.name}</span>
                                        <span className="text-xs font-bold text-white/50">{pct}%</span>
                                    </div>
                                    {/* Progress bar */}
                                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-white rounded-full transition-all duration-500"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    {/* Medals + Stars */}
                                    <div className="flex items-center gap-3 text-xs text-white/40">
                                        {medals.green > 0 && <span>🟢 {medals.green}</span>}
                                        {medals.grey > 0 && <span>⚪ {medals.grey}</span>}
                                        {medals.bronze > 0 && <span>🥉 {medals.bronze}</span>}
                                        {stars > 0 && (
                                            <span className="ml-auto flex items-center gap-1">
                                                <Star size={11} className="fill-yellow-400 text-yellow-400" />
                                                {stars}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

        </div>
    );
}
