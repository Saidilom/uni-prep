"use client";

import { useEffect, useState } from "react";
import { School, Users, FileText } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { fetchTeacherClasses } from "@/lib/class-utils";
import supabase from "@/lib/supabase/client";

// Stats-only overview for the teacher's home screen — "Создать Mock" /
// "Создать класс" live on /teacher/mock-tests and /classes (both already
// reachable from the sidebar), so this screen doesn't need to duplicate
// those actions, only show where things stand.
export default function TeacherHome() {
    const { user } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [classCount, setClassCount] = useState(0);
    const [studentCount, setStudentCount] = useState(0);
    const [mockCount, setMockCount] = useState(0);

    useEffect(() => {
        if (!user) return;
        (async () => {
            setLoading(true);
            const [classes, mocksRes] = await Promise.all([
                fetchTeacherClasses(user.id),
                supabase.from("mock_tests").select("id", { count: "exact", head: true }).eq("created_by", user.id),
            ]);
            setClassCount(classes.length);
            setStudentCount(classes.reduce((sum, c) => sum + c.memberCount, 0));
            setMockCount(mocksRes.count ?? 0);
            setLoading(false);
        })();
    }, [user]);

    const statCards = [
        { label: "Классов", value: classCount, icon: School },
        { label: "Учеников", value: studentCount, icon: Users },
        { label: "Mock-тестов создано", value: mockCount, icon: FileText },
    ];

    if (!user) return null;

    return (
        <div className="flex flex-col gap-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white shadow-sm">
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.12]"
                    style={{
                        backgroundImage: "radial-gradient(circle, white 1.5px, transparent 1.5px)",
                        backgroundSize: "18px 18px",
                    }}
                />
                <div className="relative">
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">С возвращением, {user.name}</h1>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-blue-100">
                        Общая статистика по вашим классам и тестам.
                    </p>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                {loading ? (
                    [1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />)
                ) : (
                    statCards.map((card, idx) => (
                        <div key={idx} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
                                <card.icon size={22} />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-2xl font-extrabold tabular-nums text-foreground">{card.value}</p>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</p>
                            </div>
                        </div>
                    ))
                )}
            </section>
        </div>
    );
}
