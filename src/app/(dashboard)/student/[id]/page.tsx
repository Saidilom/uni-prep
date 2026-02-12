"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { getUserProfile } from "@/lib/auth-utils";
import { User } from "@/lib/firestore-schema";
import { fetchUserGlobalStats, GlobalStats, fetchUserSubjectRatings, fetchUserBadges } from "@/lib/stats-utils";
import { SUBJECTS } from "@/lib/constants";
import { ChevronLeft, Mail, Fingerprint, Award, Star, Medal as MedalIcon, Calendar } from "lucide-react";
import Link from "next/link";

export default function StudentProfilePage() {
    const { id } = useParams();
    const router = useRouter();
    const { user: currentUser } = useAuthStore();
    const [student, setStudent] = useState<User | null>(null);
    const [stats, setStats] = useState<GlobalStats | null>(null);
    const [ratings, setRatings] = useState<Record<string, number>>({});
    const [badges, setBadges] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="w-12 h-1 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full bg-neutral-900 animate-loading"></div>
                </div>
                <style jsx>{`
                    @keyframes loading {
                        0% { width: 0%; transform: translateX(-100%); }
                        50% { width: 100%; transform: translateX(0%); }
                        100% { width: 0%; transform: translateX(100%); }
                    }
                    .animate-loading { animation: loading 1.5s infinite ease-in-out; }
                `}</style>
            </div>
        );
    }

    if (!student) {
        return (
            <div className="py-24 text-center">
                <h2 className="text-2xl font-bold text-neutral-900 mb-4">Ученик не найден.</h2>
                <Link href="/" className="text-blue-600 hover:underline">Вернуться на главную</Link>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto py-8">
            <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-neutral-500 hover:text-neutral-900 transition-colors mb-12 group"
            >
                <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                <span className="font-medium">Назад</span>
            </button>

            {/* Header: Personal Info */}
            <section className="mb-16">
                <div className="flex items-center gap-8">
                    <div className="w-24 h-24 bg-neutral-900 rounded-[2rem] flex items-center justify-center text-4xl font-bold text-white shadow-xl">
                        {student.name[0]}
                    </div>
                    <div>
                        <h1 className="text-4xl font-bold text-neutral-900 tracking-tight">
                            {student.name} {student.surname || ""}
                        </h1>
                        <div className="flex flex-wrap items-center gap-6 mt-4">
                            <div className="flex items-center gap-2 text-neutral-500">
                                <Mail size={16} />
                                <span className="text-sm font-medium">{student.email}</span>
                            </div>
                            <div className="flex items-center gap-2 text-neutral-500">
                                <Fingerprint size={16} />
                                <span className="text-sm font-mono font-bold tracking-wider">{student.shortId}</span>
                            </div>
                            <div className="flex items-center gap-2 text-neutral-500">
                                <Calendar size={16} />
                                <span className="text-sm font-medium italic">С нами с {new Date(student.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                {/* Left Column: Progress & Badges */}
                <div className="md:col-span-2 space-y-16">
                    {/* Progress by Subjects */}
                    <section>
                        <div className="flex items-center gap-3 mb-8">
                            <h2 className="text-xl font-bold text-neutral-900 tracking-tight">Прогресс по предметам</h2>
                            <div className="flex-1 h-px bg-neutral-100" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {SUBJECTS.map((subject) => {
                                const stars = ratings[subject.id] || 0;
                                return (
                                    <div key={subject.id} className="p-5 bg-white border border-neutral-100 rounded-2xl flex items-center justify-between shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{subject.emoji}</span>
                                            <span className="font-semibold text-neutral-900">{subject.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full">
                                            <Star size={14} fill="currentColor" />
                                            <span className="text-sm font-bold">{stars}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Achievements (Badges) */}
                    <section>
                        <div className="flex items-center gap-3 mb-8">
                            <h2 className="text-xl font-bold text-neutral-900 tracking-tight">Достижения</h2>
                            <div className="flex-1 h-px bg-neutral-100" />
                        </div>
                        {badges.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {badges.map((badge) => (
                                    <div key={badge.id} className="p-5 bg-neutral-50 rounded-2xl border border-neutral-100 flex items-center gap-4">
                                        <div className="text-3xl filter drop-shadow-sm">{badge.icon || "🏆"}</div>
                                        <div>
                                            <h4 className="font-bold text-neutral-900 text-sm">{badge.name}</h4>
                                            <p className="text-[10px] text-neutral-400 mt-0.5 uppercase tracking-wider font-bold">Получено {new Date(badge.unlockedAt?.toDate?.() || badge.unlockedAt).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-12 text-center bg-neutral-50 rounded-2xl border-2 border-dashed border-neutral-100">
                                <p className="text-neutral-400 font-medium">У ученика пока нет достижений.</p>
                            </div>
                        )}
                    </section>
                </div>

                {/* Right Column: Medals & Accuracy */}
                <div className="space-y-12">
                    {/* Global Stats Card */}
                    <div className="bg-neutral-900 text-white rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                        <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
                        <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-6">Общая информация</h3>

                        <div className="space-y-8">
                            <div>
                                <div className="text-4xl font-bold tracking-tight mb-1">{stats?.accuracy || 0}%</div>
                                <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Общая точность</div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center text-green-400">
                                            <MedalIcon size={16} />
                                        </div>
                                        <span className="text-sm font-medium">Зелёные</span>
                                    </div>
                                    <span className="font-bold text-lg">{stats?.medals.green || 0}</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-neutral-500/20 rounded-lg flex items-center justify-center text-neutral-400">
                                            <MedalIcon size={16} />
                                        </div>
                                        <span className="text-sm font-medium">Серые</span>
                                    </div>
                                    <span className="font-bold text-lg">{stats?.medals.grey || 0}</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center text-orange-400">
                                            <MedalIcon size={16} />
                                        </div>
                                        <span className="text-sm font-medium">Бронзовые</span>
                                    </div>
                                    <span className="font-bold text-lg">{stats?.medals.bronze || 0}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 bg-white border border-neutral-100 rounded-2xl shadow-sm">
                        <div className="flex items-center gap-2 mb-4 text-neutral-900">
                            <Award size={18} className="text-blue-600" />
                            <h4 className="font-bold text-sm tracking-tight">Роль: Ученик</h4>
                        </div>
                        <p className="text-xs text-neutral-500 leading-relaxed">
                            Ученик может самостоятельно изучать предметы, решать тесты и получать медали.
                            Учителя могут отслеживать этот прогресс в своих классах.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
