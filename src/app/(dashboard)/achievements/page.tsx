"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { fetchUserBadges } from "@/lib/profile-utils";
import { Trophy, Calendar } from "lucide-react";
import Plasma from "@/components/Plasma";

export default function AchievementsPage() {
    const { user } = useAuthStore();
    const [badges, setBadges] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (user?.id) {
            fetchUserBadges(user.id).then((data) => {
                setBadges(data);
                setIsLoading(false);
            });
        }
    }, [user]);

    return (
        <div className="relative flex flex-col gap-16 py-16 animate-in fade-in slide-in-from-bottom-8 duration-1000">
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

            {/* Header */}
            <section className="relative z-10 pt-12">
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
                    Мои достижения
                </h1>
                <p className="text-white/50 mt-4 leading-relaxed max-w-xl">
                    Ваши награды за идеальное прохождение учебников и другие успехи в обучении.
                </p>
            </section>

            {/* Badges Grid */}
            <section className="relative z-10">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(n => (
                            <div key={n} className="h-48 bg-white/5 rounded-3xl animate-pulse border border-white/10" />
                        ))}
                    </div>
                ) : badges.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {badges.map((badge) => (
                            <div
                                key={badge.id}
                                className="p-8 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.35)] flex flex-col items-center text-center group hover:bg-white/8 hover:-translate-y-1 transition-all duration-300"
                            >
                                <div className="text-6xl mb-6 group-hover:scale-110 transition-transform duration-300">
                                    {badge.icon || "🏆"}
                                </div>
                                <h3 className="text-xl font-bold text-white tracking-tight">
                                    {badge.name}
                                </h3>
                                <p className="text-sm text-white/50 mt-3 leading-relaxed">
                                    {badge.description}
                                </p>
                                <div className="mt-6 pt-6 border-t border-white/10 w-full flex items-center justify-center gap-2 text-xs text-white/30 font-medium uppercase tracking-widest">
                                    <Calendar size={12} />
                                    <span>
                                        {badge.unlockedAt?.seconds
                                            ? new Date(badge.unlockedAt.seconds * 1000).toLocaleDateString('ru-RU')
                                            : "Недавно"}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-24 text-center rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl">
                        <Trophy size={48} className="mx-auto text-white/20 mb-6" />
                        <h3 className="text-lg font-bold text-white">Пока достижений нет</h3>
                        <p className="text-white/40 mt-2">Пройдите все темы любого учебника на 🟢 зелёную медаль!</p>
                    </div>
                )}
            </section>
        </div>
    );
}
