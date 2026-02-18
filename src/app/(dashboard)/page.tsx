"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Subject } from "@/lib/firestore-schema";
import SubjectCard from "@/components/subject-card";
import { fetchUserGlobalStats, GlobalStats } from "@/lib/stats-utils";
import { fetchSubjects } from "@/lib/data-fetching";
import Plasma from "@/components/Plasma";
import { CheckCircle2, Target, Trophy } from "lucide-react";

export default function HomePage() {
    const { user } = useAuthStore();
    const [stats, setStats] = useState<GlobalStats | null>(null);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // загрузка данных
    useEffect(() => {
        if (user) {
            fetchUserGlobalStats(user.id).then(setStats);
        }
        fetchSubjects().then((data) => {
            setSubjects(data);
            setIsLoading(false);
        });
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
                    opacity={0.9}
                    mouseInteractive={true}
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
                    <div className="flex items-center justify-between mb-16 px-2">
                        <div className="flex items-center gap-4">
                            <h2 className="text-2xl font-bold text-white tracking-tight">Доступные предметы</h2>
                            <div className="px-3 py-1 bg-white/10 text-white rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/15">
                                New
                            </div>
                        </div>
                        <span className="text-sm font-bold text-white/60 uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl border border-white/10 backdrop-blur">
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
                            {subjects.map((subject) => (
                                <SubjectCard key={subject.id} subject={subject} />
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {/* Footer Support */}
            <div className="relative z-10">
                <section className="py-24 mt-12 bg-neutral-900 rounded-[3rem] text-center relative overflow-hidden">
                    <h2 className="text-4xl font-bold text-white mb-6">Нужна помощь?</h2>
                    <p className="text-white/40 max-w-md mx-auto mb-10 font-medium">
                        Наша команда всегда на связи, чтобы помочь вам с любыми вопросами по обучению.
                    </p>
                    <button className="px-10 py-4 bg-white text-neutral-900 rounded-2xl font-bold active:scale-95 transition-all">
                        Написать в поддержку
                    </button>
                </section>
            </div>
        </div>
    );
}
