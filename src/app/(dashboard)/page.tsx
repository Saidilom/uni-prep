"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Subject } from "@/lib/firestore-schema";
import SubjectCard from "@/components/subject-card";
import { fetchUserGlobalStats, GlobalStats } from "@/lib/stats-utils";
import { fetchSubjects } from "@/lib/data-fetching";
import Link from "next/link";

export default function HomePage() {
    const { user } = useAuthStore();
    const [stats, setStats] = useState<GlobalStats | null>(null);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showDashboard, setShowDashboard] = useState(false);

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

    // Simple particle generation logic for the background
    const particles = Array.from({ length: 40 }).map((_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 5}s`,
        duration: `${5 + Math.random() * 10}s`,
        color: ['#4285F4', '#EA4335', '#FBBC05', '#34A853'][Math.floor(Math.random() * 4)]
    }));

    if (!showDashboard) {
        return (
            <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center overflow-hidden">
                {/* Background Particles */}
                <div className="absolute inset-0 pointer-events-none">
                    {particles.map((p) => (
                        <div
                            key={p.id}
                            className="absolute w-1 h-3 rounded-full opacity-20 animate-float"
                            style={{
                                top: p.top,
                                left: p.left,
                                backgroundColor: p.color,
                                animationDelay: p.delay,
                                animationDuration: p.duration,
                                transform: `rotate(${Math.random() * 360}deg)`
                            }}
                        />
                    ))}
                </div>

                <div className="relative z-10 text-center px-4 animate-in fade-in zoom-in duration-1000">
                    <div className="flex items-center justify-center gap-3 mb-12">
                        <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-2xl">
                            <span className="text-white font-bold text-2xl">U</span>
                        </div>
                        <span className="text-3xl font-bold text-neutral-900 tracking-tighter">Uni-Prep.</span>
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold text-neutral-900 tracking-tight mb-6">
                        Вы успешно <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-emerald-600">авторизованы.</span>
                    </h1>

                    <p className="text-lg text-neutral-500 max-w-lg mx-auto mb-12 leading-relaxed font-medium">
                        Добро пожаловать в ваше новое образовательное пространство. Все готово для начала занятий.
                    </p>

                    <button
                        onClick={handleEnter}
                        className="group relative px-12 py-5 bg-neutral-900 text-white rounded-2xl font-bold text-lg overflow-hidden transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.15)] active:scale-95"
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            Перейти в кабинет
                            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    </button>

                    <div className="mt-16 flex items-center justify-center gap-8 text-xs font-bold text-neutral-300 uppercase tracking-widest">
                        <span>Документация</span>
                        <div className="w-1 h-1 rounded-full bg-neutral-200" />
                        <span>Поддержка</span>
                    </div>
                </div>

                <style jsx>{`
                    @keyframes float {
                        0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.1; }
                        50% { transform: translateY(-50px) rotate(180deg); opacity: 0.3; }
                    }
                    .animate-float {
                        animation: float linear infinite;
                    }
                `}</style>
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
        <div className="flex flex-col gap-32 py-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* Header Content */}
            <section className="flex flex-col md:flex-row md:items-end justify-between gap-12">
                <div className="max-w-2xl">
                    <div className="w-12 h-1 bg-neutral-900 mb-8 rounded-full" />
                    <h1 className="text-5xl font-bold tracking-tight text-neutral-900 leading-tight mb-6">
                        Выберите предмет <br />и начните <span className="text-blue-600">путешествие.</span>
                    </h1>
                    <p className="text-lg text-neutral-500 leading-relaxed font-medium">
                        Мы подготовили лучшие материалы для подготовки. Отслеживайте свой прогресс и достигайте новых вершин каждый день.
                    </p>
                </div>

                <Link href="/profile" className="flex items-center gap-3 p-4 bg-neutral-50 border border-neutral-100 rounded-2xl hover:bg-neutral-100 transition-colors group">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-xl shadow-sm group-hover:scale-110 transition-transform">
                        👤
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Твой профиль</p>
                        <p className="text-sm font-bold text-neutral-900">{user?.name || 'Личный кабинет'}</p>
                    </div>
                </Link>
            </section>

            {/* Statistics Dashboard */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {statsBlocks.map((block, idx) => (
                    <div key={idx} className="p-8 bg-white border border-neutral-100 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-500 group">
                        <div className="text-3xl mb-6 group-hover:scale-110 transition-transform origin-left">{block.icon}</div>
                        <div className="flex flex-col">
                            <span className="text-10 text-neutral-400 uppercase font-bold tracking-[0.2em] mb-2">
                                {block.label}
                            </span>
                            <span className="text-3xl font-bold text-neutral-900 tracking-tight">
                                {block.value}
                            </span>
                        </div>
                    </div>
                ))}
            </section>

            {/* Subjects Grid */}
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

            {/* Footer Support */}
            <section className="py-24 mt-12 bg-neutral-900 rounded-[4rem] text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-64 h-64 bg-blue-600/20 blur-[100px]" />
                <div className="absolute bottom-0 right-0 w-64 h-64 bg-emerald-600/20 blur-[100px]" />

                <h2 className="text-3xl font-bold text-white mb-6">Нужна помощь с обучением?</h2>
                <p className="text-white/50 max-w-lg mx-auto mb-10 font-medium">
                    Наша команда поддержки всегда готова ответить на любые вопросы и помочь разобраться в сложных темах.
                </p>
                <button className="px-8 py-4 bg-white text-neutral-900 rounded-2xl font-bold hover:scale-105 active:scale-95 transition-all">
                    Связаться с нами
                </button>
            </section>
        </div>
    );
}
