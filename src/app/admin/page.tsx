"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchAdminStats } from "@/lib/admin-utils";
import {
    GraduationCap,
    Users,
    Wallet,
    FileText,
    BookOpen,
    Library,
    ListTree,
    HelpCircle,
    ArrowRight,
} from "lucide-react";

type Stats = Awaited<ReturnType<typeof fetchAdminStats>>;

export default function AdminDashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchAdminStats().then((data) => {
            setStats(data);
            setIsLoading(false);
        });
    }, []);

    const statCards = [
        { label: "Ученики", value: stats?.students, icon: GraduationCap, accent: "from-blue-50 to-indigo-50 text-blue-600 dark:from-blue-950/40 dark:to-indigo-950/40" },
        { label: "Учителя", value: stats?.teachers, icon: Users, accent: "from-violet-50 to-purple-50 text-violet-600 dark:from-violet-950/40 dark:to-purple-950/40" },
        { label: "Выручка (UZS)", value: stats?.revenue?.toLocaleString(), icon: Wallet, accent: "from-emerald-50 to-teal-50 text-emerald-600 dark:from-emerald-950/40 dark:to-teal-950/40" },
        { label: "Mock-тесты", value: stats?.mocks, icon: FileText, accent: "from-amber-50 to-orange-50 text-amber-600 dark:from-amber-950/40 dark:to-orange-950/40" },
        { label: "Классы", value: stats?.classes, icon: Users, accent: "from-sky-50 to-blue-50 text-sky-600 dark:from-sky-950/40 dark:to-blue-950/40" },
        { label: "Попыток пройдено", value: stats?.attempts, icon: FileText, accent: "from-rose-50 to-pink-50 text-rose-600 dark:from-rose-950/40 dark:to-pink-950/40" },
    ];

    return (
        <div className="flex flex-col gap-12">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Обзор системы</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Ключевые метрики платформы в реальном времени.
                </p>
            </section>

            <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {isLoading ? (
                    [1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
                    ))
                ) : (
                    statCards.map((card, idx) => (
                        <div key={idx} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${card.accent}`}>
                                <card.icon size={22} />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-2xl font-extrabold tabular-nums text-foreground">{card.value ?? 0}</p>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</p>
                            </div>
                        </div>
                    ))
                )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-8">
                <h2 className="mb-1 text-xl font-bold tracking-tight text-foreground">Управление контентом</h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Иерархия: Предмет → Учебник → Тема → Вопрос. Соблюдайте осторожность при удалении данных.
                </p>

                <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {[
                        { href: "/admin/subjects", icon: BookOpen, label: "Управление предметами" },
                        { href: "/admin/textbooks", icon: Library, label: "Управление учебниками" },
                        { href: "/admin/topics", icon: ListTree, label: "Управление темами" },
                        { href: "/admin/questions", icon: HelpCircle, label: "Управление вопросами" },
                    ].map(({ href, icon: Icon, label }) => (
                        <Link
                            key={href}
                            href={href}
                            className="group flex items-center justify-between rounded-xl border border-border p-4 transition-colors hover:bg-muted"
                        >
                            <div className="flex items-center gap-3">
                                <Icon size={18} className="text-muted-foreground group-hover:text-foreground" />
                                <span className="font-medium text-foreground">{label}</span>
                            </div>
                            <ArrowRight size={16} className="text-muted-foreground/60 group-hover:text-foreground" />
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}
