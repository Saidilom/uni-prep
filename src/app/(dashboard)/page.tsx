"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Subject } from "@/lib/firestore-schema";
import SubjectCard from "@/components/subject-card";
import { fetchUserGlobalStats, GlobalStats } from "@/lib/stats-utils";
import { fetchSubjects } from "@/lib/data-fetching";
import Plasma from "@/components/Plasma";

import Image from "next/image";

export default function HomePage() {
    const { user } = useAuthStore();
    const [stats, setStats] = useState<GlobalStats | null>(null);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showDashboard, setShowDashboard] = useState(false);

    // загрузка данных
    useEffect(() => {
        const hasEntered = sessionStorage.getItem("hasEnteredDashboard");
        if (hasEntered) setShowDashboard(true);

        if (user) {
            fetchUserGlobalStats(user.id).then(setStats);
        }
        fetchSubjects().then((data) => {
            setSubjects(data);
            setIsLoading(false);
        });
    }, [user]);

    const handleEnter = () => {
        sessionStorage.setItem("hasEnteredDashboard", "true");
        setShowDashboard(true);
    };


    if (!showDashboard) {
        return (
            <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center overflow-hidden">
                <div className="relative z-10 text-center px-4 animate-in fade-in zoom-in duration-1000">
                    <div className="flex flex-col items-center justify-center gap-6 mb-12">
                        <div className="relative w-64 h-24 overflow-hidden">
                            <Image
                                src="/logo.png"
                                alt="Uni-Prep Logo"
                                fill
                                className="object-contain"
                            />
                        </div>
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold text-neutral-900 tracking-tight mb-6">
                        Добро пожаловать.
                    </h1>

                    <p className="text-lg text-neutral-500 max-w-lg mx-auto mb-12 leading-relaxed font-medium">
                        Ваше персональное пространство для эффективной подготовки к университету.
                    </p>

                    <button
                        onClick={handleEnter}
                        className="px-12 py-5 bg-neutral-900 text-white rounded-2xl font-bold text-lg transition-all hover:bg-neutral-800 active:scale-95"
                    >
                        Войти в кабинет
                    </button>
                </div>
            </div>
        );
    }

    const statsBlocks = [
        {
            label: "Решено вопросов",
            value: stats?.totalSolved || 0,
            icon: "✅"
        },
        {
            label: "Общая точность",
            value: `${stats?.accuracy || 0}%`,
            icon: "🎯"
        },
        {
            label: "Мои достижения",
            value: stats ? (
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm font-bold">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        {stats.medals.green}
                    </span>
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-neutral-100 text-neutral-600 rounded-full text-sm font-bold">
                        <div className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                        {stats.medals.grey}
                    </span>
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-orange-50 text-orange-700 rounded-full text-sm font-bold">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        {stats.medals.bronze}
                    </span>
                </div>
            ) : "—",
            icon: "🏆"
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
            <section className="relative z-10 flex flex-col items-center text-center gap-10 pt-10 pb-8">
                <div className="max-w-4xl">
                    <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-tight mb-6 text-white">
                        Минимальные волны
                        <br />
                        <span className="bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-sky-300 bg-clip-text text-transparent">
                            для спокойной подготовки
                        </span>
                    </h1>
                    <p className="mt-4 text-base md:text-lg text-white/60 max-w-2xl mx-auto">
                        Uni‑Prep помогает готовиться к экзаменам без стресса: чёткие темы, умные тесты и
                        аккуратная аналитика в одном личном кабинете.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 mt-4">
                    <button className="px-6 py-3.5 rounded-full bg-white text-neutral-900 font-semibold text-sm md:text-base shadow-[0_18px_45px_rgba(0,0,0,0.45)] hover:bg-neutral-100 active:scale-[0.97] transition-transform transition-colors">
                        Начать тренировку
                    </button>
                    <button className="px-6 py-3.5 rounded-full bg-white/5 text-white/80 font-semibold text-sm md:text-base border border-white/15 hover:bg-white/10 active:scale-[0.97] transition-all">
                        Посмотреть статистику
                    </button>
                </div>
            </section>

            {/* Statistics Dashboard */}
            <div className="relative z-10 mt-32">
                <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {statsBlocks.map((block, idx) => (
                        <div
                            key={idx}
                            className="p-8 bg-white border border-neutral-200 rounded-3xl transition-all group hover:shadow-xl hover:-translate-y-2 animate-in fade-in slide-in-from-bottom-8 duration-700"
                            style={{
                                animationDelay: `${idx * 150}ms`,
                                animationFillMode: 'both'
                            }}
                        >
                            <div className="text-3xl mb-6">{block.icon}</div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-neutral-400 uppercase font-black tracking-widest mb-1">
                                    {block.label}
                                </span>
                                <span className="text-4xl font-bold text-neutral-900 tracking-tight">
                                    {block.value}
                                </span>
                            </div>
                        </div>
                    ))}
                </section>
            </div>

            {/* Subjects Grid */}
            <div className="relative z-10">
                <section>
                    <div className="flex items-center justify-between mb-16 px-2">
                        <div className="flex items-center gap-4">
                            <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Доступные дисциплины.</h2>
                            <div className="px-3 py-1 bg-neutral-900 text-white rounded-full text-[10px] font-bold uppercase tracking-widest animate-pulse">
                                New
                            </div>
                        </div>
                        <span className="text-sm font-bold text-neutral-400 uppercase tracking-widest bg-neutral-50 px-4 py-2 rounded-xl">
                            {subjects.length} предметов
                        </span>
                    </div>

                    {isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                            {[1, 2, 3, 4].map((n) => (
                                <div key={n} className="h-64 bg-neutral-50 rounded-[2.5rem] animate-pulse border border-neutral-100" />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
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
