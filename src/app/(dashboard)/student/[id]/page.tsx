"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { getUserProfile } from "@/lib/auth-utils";
import { User } from "@/lib/firestore-schema";
import { fetchUserGlobalStats, GlobalStats, fetchUserSubjectRatings, fetchUserBadges } from "@/lib/stats-utils";
import { SUBJECTS } from "@/lib/constants";
import { Mail, Fingerprint, Award, Star, Medal as MedalIcon, Calendar, BookOpen, ChevronRight } from "lucide-react";
import Link from "next/link";
import Plasma from "@/components/Plasma";

export default function StudentProfilePage() {
    const { id } = useParams();
    const router = useRouter();
    const { user: currentUser } = useAuthStore();
    const [student, setStudent] = useState<User | null>(null);
    const [stats, setStats] = useState<GlobalStats | null>(null);
    const [ratings, setRatings] = useState<Record<string, number>>({});
    const [badges, setBadges] = useState<Array<{ id: string; name: string; description?: string; icon?: string; unlockedAt?: Date | { toDate: () => Date } | string | { seconds: number } }>>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Функция для преобразования unlockedAt в дату
    const getUnlockedDate = (unlockedAt?: Date | { toDate: () => Date } | string | { seconds: number }): Date | null => {
        if (!unlockedAt) return null;
        
        if (typeof unlockedAt === 'string') {
            return new Date(unlockedAt);
        }
        
        if (unlockedAt instanceof Date) {
            return unlockedAt;
        }
        
        if ('toDate' in unlockedAt && typeof unlockedAt.toDate === 'function') {
            return unlockedAt.toDate();
        }
        
        if ('seconds' in unlockedAt && typeof unlockedAt.seconds === 'number') {
            return new Date(unlockedAt.seconds * 1000);
        }
        
        return null;
    };

    useEffect(() => {
        // Only teachers should see this
        if (currentUser && currentUser.role !== "teacher") {
            router.push("/");
            return;
        }

        if (id) {
            const fetchData = async () => {
                try {
                    const [profile, globalStats, subjectRatings, userBadges] = await Promise.all([
                        getUserProfile(id as string),
                        fetchUserGlobalStats(id as string),
                        fetchUserSubjectRatings(id as string),
                        fetchUserBadges(id as string)
                    ]);

                    setStudent(profile);
                    setStats(globalStats);
                    setRatings(subjectRatings);
                    setBadges(userBadges);
                } catch (error) {
                    console.error("Error fetching student data:", error);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchData();
        }
    }, [id, currentUser, router]);

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
                <div className="relative z-10 w-28 h-10 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl animate-pulse" />
            </div>
        );
    }

    if (!student) {
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
                    <h2 className="text-2xl font-bold text-white mb-3">Ученик не найден</h2>
                    <Link href="/" className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-white text-neutral-900 text-sm font-semibold hover:bg-neutral-100 active:scale-[0.97] transition-all">
                        На главную
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="relative max-w-5xl mx-auto py-6 flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
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
                <ChevronRight size={14} className="text-white/25" />
                <span className="text-white/80">{student.name}</span>
            </nav>

            {/* Header: Personal Info */}
            <section className="relative z-10 mb-4">
                <div className="flex items-center gap-6 sm:gap-8">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 bg-white/10 border border-white/20 rounded-[2.25rem] flex items-center justify-center text-4xl font-bold text-white shadow-[0_0_40px_rgba(0,0,0,0.6)]">
                        {student.name[0]}
                    </div>
                    <div className="flex flex-col gap-3">
                        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                            {student.name} {student.surname || ""}
                        </h1>
                        <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                            <div className="flex items-center gap-2 text-white/70">
                                <Mail size={16} />
                                <span className="font-medium">{student.email}</span>
                            </div>
                            <div className="flex items-center gap-2 text-white/70">
                                <Fingerprint size={16} />
                                <span className="font-mono font-bold tracking-wider">{student.shortId}</span>
                            </div>
                            <div className="flex items-center gap-2 text-white/70">
                                <Calendar size={16} />
                                <span className="font-medium italic">
                                    С нами с{" "}
                                    {new Date(student.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-10">
                {/* Left Column: Progress & Badges */}
                <div className="md:col-span-2 space-y-10">
                    {/* Progress by Subjects */}
                    <section>
                        <div className="flex items-center gap-3 mb-6">
                            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                                Прогресс по предметам
                            </h2>
                            <div className="flex-1 h-px bg-white/15" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {SUBJECTS.map((subject) => {
                                const stars = ratings[subject.id] || 0;
                                return (
                                    <div
                                        key={subject.id}
                                        className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur flex items-center justify-between gap-4"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
                                                <BookOpen size={18} className="text-white" />
                                            </div>
                                            <span className="font-semibold text-white text-sm sm:text-base">
                                                {subject.name}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-amber-300">
                                            <Star size={14} fill="currentColor" />
                                            <span className="text-sm font-bold text-amber-200">{stars}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Achievements (Badges) */}
                    <section>
                        <div className="flex items-center gap-3 mb-6">
                            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                                Достижения
                            </h2>
                            <div className="flex-1 h-px bg-white/15" />
                        </div>
                        {badges.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {badges.map((badge) => (
                                    <div
                                        key={badge.id}
                                        className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur flex items-center gap-4"
                                    >
                                        <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
                                            <Award size={20} className="text-white" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white text-sm">
                                                {badge.name}
                                            </h4>
                                            <p className="text-[10px] text-white/50 mt-0.5 uppercase tracking-wider font-bold">
                                                Получено{" "}
                                                {getUnlockedDate(badge.unlockedAt)
                                                    ? getUnlockedDate(badge.unlockedAt)!.toLocaleDateString('ru-RU')
                                                    : "Недавно"}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-10 text-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
                                <p className="text-white/60 font-medium">
                                    У ученика пока нет достижений.
                                </p>
                            </div>
                        )}
                    </section>
                </div>

                {/* Right Column: Medals & Accuracy */}
                <div className="space-y-8">
                    {/* Global Stats Card */}
                    <div className="relative rounded-3xl p-8 bg-white/5 border border-white/15 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.45)] overflow-hidden">
                        <div className="absolute -top-16 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
                        <div className="relative z-10">
                            <h3 className="text-xs font-bold text-white/50 uppercase tracking-[0.25em] mb-6">
                                Общая статистика
                            </h3>

                            <div className="space-y-8">
                                <div>
                                    <div className="text-4xl font-bold tracking-tight text-white mb-1">
                                        {stats?.accuracy || 0}%
                                    </div>
                                    <div className="text-[10px] font-bold text-white/50 uppercase tracking-[0.2em]">
                                        Общая точность
                                    </div>
                                </div>

                                <div className="space-y-4 text-white">
                                    <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-500/10 border border-emerald-300/40">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-emerald-500/30 flex items-center justify-center text-emerald-100">
                                                <MedalIcon size={16} />
                                            </div>
                                            <span className="text-sm font-medium">Зелёные</span>
                                        </div>
                                        <span className="font-bold text-lg">
                                            {stats?.medals.green || 0}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/15">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white/70">
                                                <MedalIcon size={16} />
                                            </div>
                                            <span className="text-sm font-medium">Серые</span>
                                        </div>
                                        <span className="font-bold text-lg">
                                            {stats?.medals.grey || 0}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between p-3 rounded-2xl bg-orange-500/10 border border-orange-300/40">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-orange-500/30 flex items-center justify-center text-orange-100">
                                                <MedalIcon size={16} />
                                            </div>
                                            <span className="text-sm font-medium">Бронзовые</span>
                                        </div>
                                        <span className="font-bold text-lg">
                                            {stats?.medals.bronze || 0}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur">
                        <div className="flex items-center gap-2 mb-4 text-white">
                            <Award size={18} className="text-white" />
                            <h4 className="font-bold text-sm tracking-tight">Роль: Ученик</h4>
                        </div>
                        <p className="text-xs text-white/60 leading-relaxed">
                            Ученик может самостоятельно изучать предметы, решать тесты и получать
                            медали. Учителя видят этот прогресс в своих классах и личных кабинетах.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
