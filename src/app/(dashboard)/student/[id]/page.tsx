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
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

export default function StudentProfilePage() {
    const { id } = useParams();
    const router = useRouter();
    const { user: currentUser } = useAuthStore();
    const { locale } = useLocale();
    const t = useTranslations("studentProfile");
    const [student, setStudent] = useState<User | null>(null);
    const [stats, setStats] = useState<GlobalStats | null>(null);
    const [ratings, setRatings] = useState<Record<string, number>>({});
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
                        fetchUserBadges(id as string),
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
            void fetchData();
        }
    }, [id, currentUser, router]);

    if (isLoading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="h-10 w-28 animate-pulse rounded-3xl border border-border bg-muted" />
            </div>
        );
    }

    if (!student) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="max-w-md rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-sm">
                    <h2 className="mb-3 text-2xl font-bold text-foreground">{t("studentNotFound")}</h2>
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center rounded-2xl bg-foreground px-6 py-3 text-sm font-semibold text-background transition-all hover:opacity-90 active:scale-[0.97]"
                    >
                        {t("toHome")}
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto flex max-w-5xl animate-in fade-in slide-in-from-bottom-4 flex-col gap-10 py-6 duration-700">
            <nav className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
                <Link href="/classes" className="transition-colors hover:text-foreground">
                    {t("classesBreadcrumb")}
                </Link>
                <ChevronRight size={14} className="text-muted-foreground/60" />
                <span className="text-foreground">{student.name}</span>
            </nav>

            <section className="mb-4">
                <div className="flex items-center gap-6 sm:gap-8">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[2.25rem] border border-border bg-muted text-4xl font-bold text-foreground shadow-sm sm:h-28 sm:w-28">
                        {student.name[0]}
                    </div>
                    <div className="flex flex-col gap-3">
                        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                            {student.name} {student.surname || ""}
                        </h1>
                        <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Mail size={16} className="shrink-0" />
                                <span className="font-medium text-foreground">{student.email}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Fingerprint size={16} className="shrink-0" />
                                <span className="font-mono font-bold tracking-wider text-foreground">
                                    {student.shortId}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Calendar size={16} className="shrink-0" />
                                <span className="font-medium italic text-foreground/90">
                                    {t("memberSince").replace("{date}", new Date(student.createdAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ"))}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
                <div className="space-y-10 md:col-span-2">
                    <section>
                        <div className="mb-6 flex items-center gap-3">
                            <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                                {t("subjectProgress")}
                            </h2>
                            <div className="h-px flex-1 bg-border" />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {SUBJECTS.map((subject) => {
                                const stars = ratings[subject.id] || 0;
                                return (
                                    <div
                                        key={subject.id}
                                        className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted">
                                                <BookOpen size={18} className="text-muted-foreground" />
                                            </div>
                                            <span className="truncate text-sm font-semibold text-foreground sm:text-base">
                                                {subject.name}
                                            </span>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 dark:border-amber-800 dark:bg-amber-950/40">
                                            <Star size={14} className="text-amber-600 dark:text-amber-400" fill="currentColor" />
                                            <span className="text-sm font-bold tabular-nums text-amber-800 dark:text-amber-200">
                                                {stars}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section>
                        <div className="mb-6 flex items-center gap-3">
                            <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                                {t("achievements")}
                            </h2>
                            <div className="h-px flex-1 bg-border" />
                        </div>
                        {badges.length > 0 ? (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                {badges.map((badge) => (
                                    <div
                                        key={badge.id}
                                        className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
                                    >
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted">
                                            <Award size={20} className="text-muted-foreground" />
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-bold text-foreground">{badge.name}</h4>
                                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                {t("earnedOn").replace("{date}", getUnlockedDate(badge.unlockedAt)
                                                    ? getUnlockedDate(badge.unlockedAt)!.toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ")
                                                    : t("recently"))}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                                <p className="font-medium text-muted-foreground">{t("noAchievementsYet")}</p>
                            </div>
                        )}
                    </section>
                </div>

                <div className="space-y-8">
                    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-sm">
                        <h3 className="mb-6 text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
                            {t("overallStats")}
                        </h3>

                        <div className="space-y-8">
                            <div>
                                <div className="mb-1 text-4xl font-bold tracking-tight text-foreground tabular-nums">
                                    {stats?.accuracy || 0}%
                                </div>
                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                                    {t("overallAccuracy")}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/35">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-800 dark:bg-emerald-500/30 dark:text-emerald-200">
                                            <MedalIcon size={16} />
                                        </div>
                                        <span className="text-sm font-medium text-foreground">{t("greenMedals")}</span>
                                    </div>
                                    <span className="text-lg font-bold tabular-nums text-foreground">
                                        {stats?.medals.green || 0}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/60 p-3 dark:bg-muted/40">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                                            <MedalIcon size={16} />
                                        </div>
                                        <span className="text-sm font-medium text-foreground">{t("greyMedals")}</span>
                                    </div>
                                    <span className="text-lg font-bold tabular-nums text-foreground">
                                        {stats?.medals.grey || 0}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50 p-3 dark:border-orange-900 dark:bg-orange-950/35">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/20 text-orange-800 dark:bg-orange-500/30 dark:text-orange-200">
                                            <MedalIcon size={16} />
                                        </div>
                                        <span className="text-sm font-medium text-foreground">{t("bronzeMedals")}</span>
                                    </div>
                                    <span className="text-lg font-bold tabular-nums text-foreground">
                                        {stats?.medals.bronze || 0}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-border bg-muted/50 p-6 dark:bg-muted/30">
                        <div className="mb-4 flex items-center gap-2 text-foreground">
                            <Award size={18} />
                            <h4 className="text-sm font-bold tracking-tight">{t("roleStudentTitle")}</h4>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            {t("roleStudentDescription")}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
