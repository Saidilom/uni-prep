"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { fetchUserBadges } from "@/lib/stats-utils";
import { Trophy, Calendar } from "lucide-react";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

export default function AchievementsPage() {
    const { user } = useAuthStore();
    const { locale } = useLocale();
    const t = useTranslations("achievements");
    const [badges, setBadges] = useState<
        Array<{
            id: string;
            name: string;
            description?: string;
            icon?: string;
            unlockedAt?: Date | { toDate: () => Date } | string | { seconds: number };
        }>
    >([]);
    const [isLoading, setIsLoading] = useState(true);

    const getUnlockedDate = (
        unlockedAt?: Date | { toDate: () => Date } | string | { seconds: number }
    ): Date | null => {
        if (!unlockedAt) return null;

        if (typeof unlockedAt === "string") {
            return new Date(unlockedAt);
        }

        if (unlockedAt instanceof Date) {
            return unlockedAt;
        }

        if ("toDate" in unlockedAt && typeof unlockedAt.toDate === "function") {
            return unlockedAt.toDate();
        }

        if ("seconds" in unlockedAt && typeof unlockedAt.seconds === "number") {
            return new Date(unlockedAt.seconds * 1000);
        }

        return null;
    };

    useEffect(() => {
        if (user?.id) {
            fetchUserBadges(user.id).then((data) => {
                setBadges(data);
                setIsLoading(false);
            });
        }
    }, [user]);

    return (
        <div className="flex animate-in fade-in slide-in-from-bottom-4 flex-col gap-10 py-4 duration-700">
            <section>
                <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
                    {t("title")}
                </h1>
                <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                    {t("subtitle")}
                </p>
            </section>

            <section>
                {isLoading ? (
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map((n) => (
                            <div
                                key={n}
                                className="h-48 animate-pulse rounded-2xl border border-border bg-muted"
                            />
                        ))}
                    </div>
                ) : badges.length > 0 ? (
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                        {badges.map((badge) => (
                            <div
                                key={badge.id}
                                className="group flex flex-col items-center rounded-2xl border border-border bg-card p-8 text-center transition-all duration-300 hover:-translate-y-0.5 hover:shadow-sm"
                            >
                                <div className="mb-5 text-6xl transition-transform duration-300 group-hover:scale-110">
                                    {badge.icon || "🏆"}
                                </div>
                                <h3 className="text-xl font-bold tracking-tight text-foreground">{badge.name}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                    {badge.description}
                                </p>
                                <div className="mt-5 flex w-full items-center justify-center gap-2 border-t border-border pt-5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                                    <Calendar size={12} />
                                    <span>
                                        {getUnlockedDate(badge.unlockedAt)
                                            ? getUnlockedDate(badge.unlockedAt)!.toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ")
                                            : t("recently")}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-2xl border border-border bg-muted/50 py-24 text-center dark:bg-muted/30">
                        <Trophy size={48} className="mx-auto mb-5 text-muted-foreground" />
                        <h3 className="text-lg font-bold text-foreground">{t("noAchievementsYet")}</h3>
                        <p className="mt-2 text-muted-foreground">
                            {t("completeAllTopics")}
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
}
