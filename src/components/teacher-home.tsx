"use client";

import { useEffect, useState } from "react";
import { School, Users, FileText, Trophy } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { fetchTeacherClasses, fetchTeacherResultsOverview } from "@/lib/class-utils";
import supabase from "@/lib/supabase/client";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Stats-only overview for the teacher's home screen — "Создать Mock" /
// "Создать класс" live on /teacher/mock-tests and /classes (both already
// reachable from the sidebar), so this screen doesn't need to duplicate
// those actions, only show where things stand.
export default function TeacherHome() {
    const { user } = useAuthStore();
    const t = useTranslations("teacherDashboard");
    const [loading, setLoading] = useState(true);
    const [classCount, setClassCount] = useState(0);
    const [studentCount, setStudentCount] = useState(0);
    const [mockCount, setMockCount] = useState(0);
    const [avgAccuracy, setAvgAccuracy] = useState<number | null>(null);

    useEffect(() => {
        if (!user) return;
        (async () => {
            setLoading(true);
            const [classes, mocksRes, overview] = await Promise.all([
                fetchTeacherClasses(user.id),
                supabase.from("mock_tests").select("id", { count: "exact", head: true }).eq("created_by", user.id),
                fetchTeacherResultsOverview(user.id),
            ]);
            setClassCount(classes.length);
            setStudentCount(classes.reduce((sum, c) => sum + c.memberCount, 0));
            setMockCount(mocksRes.count ?? 0);
            setAvgAccuracy(overview.overallAvgAccuracy);
            setLoading(false);
        })();
    }, [user]);

    const statCards = [
        { label: t("classesCountLabel"), value: classCount, icon: School },
        { label: t("studentsCountLabel"), value: studentCount, icon: Users },
        { label: t("mocksCreatedLabel"), value: mockCount, icon: FileText },
        // Средний по всем мокам всех учеников — в процентах: складываются
        // разные тесты с разным максимумом (design/FIX.md, «Правило
        // отображения баллов»).
        { label: t("avgStudentScoreLabel"), value: avgAccuracy !== null ? `${avgAccuracy}%` : "—", icon: Trophy },
    ];

    if (!user) return null;

    return (
        <div className="flex flex-col gap-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {t("welcomeBack")} <span className="font-medium text-muted-foreground">{user.name?.trim()}</span>
                </h1>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    {t("statsSubtitle")}
                </p>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                {loading ? (
                    <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
                        {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-border lg:grid-cols-4">
                        {statCards.map((card, idx) => (
                            <div key={idx} className="p-6">
                                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                                    <card.icon size={20} strokeWidth={1.75} />
                                </div>
                                <p className="text-xs text-muted-foreground">{card.label}</p>
                                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{card.value}</p>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
