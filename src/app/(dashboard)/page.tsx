"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Subject } from "@/lib/firestore-schema";
import SubjectCard from "@/components/subject-card";
import { fetchUserGlobalStats, GlobalStats, fetchUserSubjectRatings, fetchSubjectProgress } from "@/lib/stats-utils";
import { fetchSubjects, fetchTextbooksBySubject, fetchTopicsByTextbook } from "@/lib/data-fetching";
import Plasma from "@/components/Plasma";
import Particles from "@/components/Particles";
import { CheckCircle2, Target, Trophy } from "lucide-react";

interface SubjectProgress {
    stars: number;
    medals: { green: number; grey: number; bronze: number };
    progress: number;
}

export default function HomePage() {
    const { user } = useAuthStore();
    const [stats, setStats] = useState<GlobalStats | null>(null);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [subjectProgress, setSubjectProgress] = useState<Record<string, SubjectProgress>>({});
    const [isLoading, setIsLoading] = useState(true);

    // загрузка данных
    useEffect(() => {
        const loadData = async () => {
            // 1. Всегда сначала грузим предметы и сразу показываем карточки
            setIsLoading(true);
            const subjectsData = await fetchSubjects();
            setSubjects(subjectsData);
            setIsLoading(false);

            // 2. Если пользователь не авторизован — на этом всё
            if (!user) return;

            // 3. Параллельно загружаем общую статистику и рейтинги
            const [globalStats, ratings] = await Promise.all([
                fetchUserGlobalStats(user.id),
                fetchUserSubjectRatings(user.id)
            ]);
            setStats(globalStats);

            // 4. Прогресс по предметам считаем в фоне, не блокируя отображение карточек
            const progressEntries = await Promise.all(
                subjectsData.map(async (subject) => {
                    const textbooks = await fetchTextbooksBySubject(subject.id);

                    const allTopicIds: string[] = [];
                    for (const textbook of textbooks) {
                        const topics = await fetchTopicsByTextbook(textbook.id);
                        allTopicIds.push(...topics.map((t) => t.id));
                    }

                    const progress = await fetchSubjectProgress(user.id, subject.id, allTopicIds);

                    const subjectProgress: SubjectProgress = {
                        stars: ratings[subject.id] || 0,
                        medals: progress.medals,
                        progress: progress.progress
                    };

                    return [subject.id, subjectProgress] as const;
                })
            );

            setSubjectProgress(Object.fromEntries(progressEntries));
        };

        loadData();
    }, [user]);

    const statsBlocks = [
        {
            label: "Решено вопросов",
            value: stats?.totalSolved || 0,
            icon: CheckCircle2
        },
        {
            label: "Общая точность",
            value: `${stats?.accuracy || 0}%`,
            icon: Target
        },
        {
            label: "Мои достижения",
            value: stats ? (
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-white/10 text-white rounded-full text-sm font-bold border border-white/15 backdrop-blur">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                        {stats.medals.green}
                    </span>
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-white/10 text-white/80 rounded-full text-sm font-bold border border-white/10 backdrop-blur">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                        {stats.medals.grey}
                    </span>
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-white/10 text-white rounded-full text-sm font-bold border border-white/15 backdrop-blur">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-300" />
                        {stats.medals.bronze}
                    </span>
                </div>
            ) : "—",
            icon: Trophy
        },
    ];

    return (
        <div className="relative flex flex-col gap-32 py-16 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* Plasma background for main dashboard page */}
            <div className="fixed inset-0 z-0">
                <Plasma
                    color="#ffffff"
                    speed={1.0}
                    direction="forward"
                    scale={1.2}
                    opacity={0.9} mouseInteractive={true}
                />
            </div>

            {/* Header Content */}
            <section className="relative z-10 flex flex-col items-center text-center gap-8 pt-20 md:pt-28 pb-8">
                <div className="max-w-3xl">
                    <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight mb-4 text-white">
                        Подготовка без стресса
                    </h1>
                    <p className="mt-2 text-lg md:text-xl text-neutral-300 max-w-2xl mx-auto">
                        Структурированные материалы, интеллектуальные тесты и мгновенная обратная связь
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
                    <button className="px-8 py-3 rounded-full bg-white hover:bg-neutral-100 text-neutral-900 font-semibold text-sm md:text-base shadow-[0_18px_45px_rgba(0,0,0,0.45)] active:scale-[0.97] transition-transform transition-colors">
                        Начать учиться
                    </button>
                    <button className="px-8 py-3 rounded-full border-2 border-white hover:bg-white/10 text-white font-semibold text-sm md:text-base active:scale-[0.97] transition-all">
                        Узнать больше
                    </button>
                </div>
            </section>

            {/* Statistics Dashboard */}
            <div className="relative z-10 mt-72 md:mt-80">
                <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {statsBlocks.map((block, idx) => (
                        <div
                            key={idx}
                            className="p-8 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.35)] transition-all group hover:bg-white/7 hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-8 duration-700"
                            style={{
                                animationDelay: `${idx * 150}ms`,
                                animationFillMode: 'both'
                            }}
                        >
                            <div className="mb-6 flex items-center gap-3">
                                {typeof block.icon === "string" ? (
                                    <div className="text-3xl">{block.icon}</div>
                                ) : (
                                    <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/15 backdrop-blur flex items-center justify-center">
                                        <block.icon className="w-5 h-5 text-white" />
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-white/55 uppercase font-black tracking-widest mb-1">
                                    {block.label}
                                </span>
                                <span className="text-4xl font-bold text-white tracking-tight">
                                    {block.value}
                                </span>
                            </div>
                        </div>
                    ))}
                </section>
            </div>

            {/* Subjects Grid */}
            <div className="relative z-10 mt-6 md:mt-8">
                <section>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-10 sm:mb-16 px-2">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Доступные предметы</h2>
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-white/60 uppercase tracking-widest bg-white/5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-white/10 backdrop-blur self-start sm:self-auto">
                            {subjects.length} предметов
                        </span>
                    </div>

                    {isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                            {[1, 2, 3, 4].map((n) => (
                                <div key={n} className="h-64 bg-neutral-50 rounded-[2.5rem] animate-pulse border border-neutral-100" />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                            {subjects.map((subject) => {
                                const progress = subjectProgress[subject.id] || {
                                    stars: 0,
                                    medals: { green: 0, grey: 0, bronze: 0 },
                                    progress: 0
                                };
                                return (
                                    <SubjectCard
                                        key={subject.id}
                                        subject={subject}
                                        stars={progress.stars}
                                        medals={progress.medals}
                                        progress={progress.progress}
                                    />
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>

            {/* Footer Support */}
            <div className="relative z-10 px-4">
                <section className="py-24 mt-12 bg-white/[0.03] border border-white/10 rounded-[3rem] text-center relative overflow-hidden group backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
                    <div className="absolute inset-0 z-0">
                        <Particles
                            className=""
                            particleCount={200}
                            particleSpread={6}
                            speed={0.2}
                            particleColors={['#ffffff', '#888888', '#ffffff']}
                            moveParticlesOnHover={false}
                            particleHoverFactor={0}
                            alphaParticles={true}
                            particleBaseSize={80}
                            sizeRandomness={0.5}
                            cameraDistance={15}
                            disableRotation={false}
                        />
                    </div>
                    {/* Reflective glow overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

                    <div className="relative z-10 px-8">
                        <h2 className="text-4xl font-bold text-white mb-6">Нужна помощь?</h2>
                        <p className="text-white/60 max-w-md mx-auto mb-10 font-medium">
                            Наша команда всегда на связи, чтобы помочь вам с любыми вопросами по обучению.
                        </p>
                        <button className="px-10 py-4 bg-white text-black rounded-2xl font-bold active:scale-95 transition-all hover:scale-105 hover:bg-neutral-100 shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                            Написать в поддержку
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}
