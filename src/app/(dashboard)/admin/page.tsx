"use client";

import { useEffect, useState } from "react";
import { fetchAdminStats } from "@/lib/admin-utils";
import {
    Users,
    GraduationCap,
    BookOpen,
    Library,
    ListTree,
    HelpCircle,
    ArrowRight
} from "lucide-react";

export default function AdminDashboard() {
    const [stats, setStats] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchAdminStats().then((data) => {
            setStats(data);
            setIsLoading(false);
        });
    }, []);

    const statCards = [
        { label: "Ученики", value: stats?.students, icon: GraduationCap, color: "text-blue-600" },
        { label: "Учителя", value: stats?.teachers, icon: Users, color: "text-purple-600" },
        { label: "Предметы", value: stats?.subjects, icon: BookOpen, color: "text-green-600" },
        { label: "Учебники", value: stats?.textbooks, icon: Library, color: "text-orange-600" },
        { label: "Темы", value: stats?.topics, icon: ListTree, color: "text-rose-600" },
        { label: "Вопросы", value: stats?.questions, icon: HelpCircle, color: "text-amber-600" },
    ];

    return (
        <div className="flex flex-col gap-12">
            <section>
                <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">
                    Обзор.
                </h1>
                <p className="text-neutral-500 mt-4 leading-relaxed max-w-xl">
                    Общая статистика системы и панель управления контентом.
                </p>
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                    [1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-32 bg-white rounded-xl border border-neutral-200 animate-pulse shadow-sm" />
                    ))
                ) : (
                    statCards.map((card, idx) => (
                        <div key={idx} className="bg-white p-8 rounded-xl border border-neutral-200 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-3xl font-bold text-neutral-900 tracking-tight">
                                    {card.value || 0}
                                </p>
                                <p className="text-sm font-medium text-neutral-500 mt-1 uppercase tracking-wider">{card.label}</p>
                            </div>
                            <div className={`p-4 rounded-xl bg-neutral-50 ${card.color}`}>
                                <card.icon size={24} />
                            </div>
                        </div>
                    ))
                )}
            </section>

            <section className="bg-white border border-neutral-200 rounded-2xl p-8">
                <h2 className="text-xl font-semibold text-neutral-900 tracking-tight mb-4">Управление контентом.</h2>
                <p className="text-sm text-neutral-500 leading-relaxed max-w-2xl italic">
                    Совет: Иерархия контента: Предмет → Учебник → Тема → Вопрос.
                    Соблюдайте осторожность при удалении данных.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                    <a href="/admin/subjects" className="p-4 border border-neutral-100 rounded-xl hover:bg-neutral-50 transition-colors flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                            <BookOpen size={18} className="text-neutral-400 group-hover:text-neutral-900" />
                            <span className="font-medium">Управление предметами</span>
                        </div>
                        <ArrowRight size={16} className="text-neutral-300 group-hover:text-neutral-900" />
                    </a>
                    <a href="/admin/textbooks" className="p-4 border border-neutral-100 rounded-xl hover:bg-neutral-50 transition-colors flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                            <Library size={18} className="text-neutral-400 group-hover:text-neutral-900" />
                            <span className="font-medium">Управление учебниками</span>
                        </div>
                        <ArrowRight size={16} className="text-neutral-300 group-hover:text-neutral-900" />
                    </a>
                    <a href="/admin/topics" className="p-4 border border-neutral-100 rounded-xl hover:bg-neutral-50 transition-colors flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                            <ListTree size={18} className="text-neutral-400 group-hover:text-neutral-900" />
                            <span className="font-medium">Управление темами</span>
                        </div>
                        <ArrowRight size={16} className="text-neutral-300 group-hover:text-neutral-900" />
                    </a>
                    <a href="/admin/questions" className="p-4 border border-neutral-100 rounded-xl hover:bg-neutral-50 transition-colors flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                            <HelpCircle size={18} className="text-neutral-400 group-hover:text-neutral-900" />
                            <span className="font-medium">Управление вопросами</span>
                        </div>
                        <ArrowRight size={16} className="text-neutral-300 group-hover:text-neutral-900" />
                    </a>
                </div>
            </section>
        </div>
    );
}
