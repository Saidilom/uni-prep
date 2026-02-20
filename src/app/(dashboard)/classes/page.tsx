"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Class } from "@/lib/firestore-schema";
import { SUBJECTS } from "@/lib/constants";
import { createClass, fetchTeacherClasses } from "@/lib/class-utils";
import CreateClassModal from "@/components/create-class-modal";
import Link from "next/link";
import { Plus } from "lucide-react";
import Plasma from "@/components/Plasma";

export default function ClassesPage() {
    const { user } = useAuthStore();
    const [classes, setClasses] = useState<Class[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        if (user?.id) {
            fetchTeacherClasses(user.id).then((data) => {
                setClasses(data);
                setIsLoading(false);
            });
        }
    }, [user]);

    const handleCreateClass = async (name: string, subjectId: string) => {
        if (!user) return;
        const newClass = await createClass(user.id, name, subjectId);
        setClasses((prev) => [{ ...newClass, createdAt: typeof newClass.createdAt === 'string' ? newClass.createdAt : new Date().toISOString() } as Class, ...prev]);
    };

    if (user?.role !== "teacher") {
        return (
            <div className="relative min-h-[60vh] flex items-center justify-center">
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
                <div className="relative z-10 px-6 py-10 rounded-3xl bg-white/5 border border-white/15 backdrop-blur-xl text-center shadow-[0_0_40px_rgba(0,0,0,0.35)]">
                    <h2 className="text-2xl font-semibold text-white mb-2">Доступ ограничен</h2>
                    <p className="text-white/60 text-sm max-w-sm">
                        Страница управления классами доступна только для учителей.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative flex flex-col gap-12 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
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

            <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
                <section>
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                        Мои классы
                    </h1>
                    <p className="text-white/60 mt-3 leading-relaxed max-w-xl text-sm sm:text-base">
                        Создавайте учебные группы, делитесь материалами и отслеживайте прогресс учеников в одном месте.
                    </p>
                </section>

                <button
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-white text-neutral-900 text-sm font-semibold shadow-[0_18px_45px_rgba(0,0,0,0.45)] hover:bg-neutral-100 active:scale-[0.97] transition-all self-start md:self-auto"
                >
                    <Plus size={18} />
                    <span>Создать класс</span>
                </button>
            </div>

            <section className="relative z-10">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
                        {[1, 2, 3].map((n) => (
                            <div
                                key={n}
                                className="h-56 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl animate-pulse"
                            />
                        ))}
                    </div>
                ) : classes.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
                        {classes.map((cls) => {
                            const subject = SUBJECTS.find((s) => s.id === cls.subjectId);
                            return (
                                <Link
                                    key={cls.id}
                                    href={`/classes/${cls.id}`}
                                    className="group relative p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.35)] hover:bg-white/8 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                                >
                                    <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-radial-at-t from-white/12 via-transparent to-transparent" />
                                    <div className="relative flex flex-col gap-4 h-56">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl">
                                                    {subject?.emoji || "📚"}
                                                </div>
                                                <div className="flex flex-col">
                                                    <h3 className="text-base font-semibold text-white tracking-tight">
                                                        {cls.name}
                                                    </h3>
                                                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/50">
                                                        {subject?.name || "Предмет не указан"}
                                                    </span>
                                                </div>
                                            </div>
                                            <span className="text-xs font-medium text-white/60 bg-white/5 border border-white/15 rounded-full px-3 py-1">
                                                {cls.students.length} учеников
                                            </span>
                                        </div>

                                        <div className="mt-auto pt-2 text-sm font-semibold text-white/80 inline-flex items-center gap-1">
                                            <span>Управление классом</span>
                                            <span className="transition-transform group-hover:translate-x-1">
                                                →
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-16 px-6 text-center rounded-[2.5rem] border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_15px_45px_rgba(0,0,0,0.35)]">
                        <p className="text-white/60 font-medium">
                            У вас пока нет созданных классов.
                        </p>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-neutral-900 text-sm font-semibold hover:bg-neutral-100 active:scale-[0.97] transition-all"
                        >
                            <Plus size={16} />
                            <span>Создать первый класс</span>
                        </button>
                    </div>
                )}
            </section>

            <CreateClassModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreated={handleCreateClass}
            />
        </div>
    );
}
