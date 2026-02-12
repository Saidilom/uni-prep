"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Class } from "@/lib/firestore-schema";
import { SUBJECTS } from "@/lib/constants";
import { createClass, fetchTeacherClasses } from "@/lib/class-utils";
import CreateClassModal from "@/components/create-class-modal";
import Link from "next/link";
import { Plus } from "lucide-react";

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
        setClasses((prev) => [newClass as any as Class, ...prev]);
    };

    if (user?.role !== "teacher") {
        return (
            <div className="py-24 text-center">
                <h2 className="text-2xl font-semibold text-neutral-900">Доступ ограничен.</h2>
                <p className="text-neutral-500 mt-2">Эта страница доступна только для учителей.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-16">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <section>
                    <h1 className="text-4xl font-semibold tracking-tight text-neutral-900 leading-tight">
                        Мои классы.
                    </h1>
                    <p className="text-neutral-500 mt-4 leading-relaxed max-w-xl">
                        Управляйте учебными группами, отслеживайте прогресс учеников и организуйте свое рабочее пространство.
                    </p>
                </section>

                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center justify-center gap-2 px-6 py-4 bg-neutral-900 text-white rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                >
                    <Plus size={20} />
                    <span>Создать класс</span>
                </button>
            </div>

            <section>
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-48 bg-neutral-50 rounded-xl animate-pulse border border-neutral-100" />
                        ))}
                    </div>
                ) : classes.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {classes.map((cls) => {
                            const subject = SUBJECTS.find((s) => s.id === cls.subjectId);
                            return (
                                <Link
                                    key={cls.id}
                                    href={`/classes/${cls.id}`}
                                    className="bg-white p-8 rounded-xl border border-neutral-200 shadow-sm hover:shadow-md hover:border-neutral-400 transition-all group"
                                >
                                    <div className="text-3xl mb-4">{subject?.emoji || "📚"}</div>
                                    <h3 className="text-xl font-semibold text-neutral-900 tracking-tight group-hover:text-neutral-900 transition-colors">
                                        {cls.name}
                                    </h3>
                                    <p className="text-sm text-neutral-500 mt-2">
                                        {subject?.name} • {cls.students.length} учеников
                                    </p>
                                    <div className="mt-6 text-sm font-medium text-neutral-900 inline-flex items-center gap-1">
                                        Управление →
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-24 text-center rounded-2xl border-2 border-dashed border-neutral-100">
                        <p className="text-neutral-400 font-medium">У вас пока нет созданных классов.</p>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="mt-4 text-sm font-semibold text-neutral-900 hover:underline"
                        >
                            Начните с создания первого класса
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
