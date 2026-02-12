"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { fetchUserBadges } from "@/lib/profile-utils";
import { Trophy, Calendar } from "lucide-react";

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
        <div className="flex flex-col gap-16">
            <section>
                <h1 className="text-4xl font-semibold tracking-tight text-neutral-900 leading-tight">
                    Мои достижения.
                </h1>
                <p className="text-neutral-500 mt-4 leading-relaxed max-w-xl">
                    Ваши награды за идеальное прохождение учебников и другие успехи в обучении.
                </p>
            </section>

            <section>
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {[1, 2, 3].map(n => (
                            <div key={n} className="h-48 bg-neutral-50 rounded-xl animate-pulse border border-neutral-100" />
                        ))}
                    </div>
                ) : badges.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {badges.map((badge) => (
                            <div key={badge.id} className="bg-white p-8 rounded-xl border border-neutral-200 shadow-sm flex flex-col items-center text-center group hover:border-neutral-900 transition-all">
                                <div className="text-6xl mb-6 group-hover:scale-110 transition-transform">
                                    {badge.icon || "🏆"}
                                </div>
                                <h3 className="text-xl font-semibold text-neutral-900 tracking-tight">
                                    {badge.name}
                                </h3>
                                <p className="text-sm text-neutral-500 mt-3 leading-relaxed">
                                    {badge.description}
                                </p>
                                <div className="mt-6 pt-6 border-t border-neutral-100 w-full flex items-center justify-center gap-2 text-xs text-neutral-400 font-medium uppercase tracking-widest">
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
                    <div className="py-24 text-center rounded-2xl border-2 border-dashed border-neutral-100">
                        <Trophy size={48} className="mx-auto text-neutral-200 mb-6" />
                        <h3 className="text-lg font-semibold text-neutral-900">Пока достижений нет</h3>
                        <p className="text-neutral-400 mt-2">Пройдите все темы любого учебника на 🟢 зелёную медаль!</p>
                    </div>
                )}
            </section>
        </div>
    );
}
