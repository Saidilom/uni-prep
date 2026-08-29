"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Users, GraduationCap, X, FileUp } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/useToast";
import { fetchTeacherClasses, createClass, ClassWithCount } from "@/lib/class-utils";
import { pluralizeRu } from "@/lib/pluralize-ru";

export default function TeacherDashboard() {
    const { user } = useAuthStore();
    const toast = useToast();
    const [classes, setClasses] = useState<ClassWithCount[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [saving, setSaving] = useState(false);

    const load = async () => {
        if (!user) return;
        setLoading(true);
        setClasses(await fetchTeacherClasses(user.id));
        setLoading(false);
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const handleCreate = async () => {
        if (!user || newName.trim().length < 1) return;
        setSaving(true);
        try {
            await createClass(user.id, newName.trim());
            setNewName("");
            setCreating(false);
            toast.success("Группа создана");
            load();
        } catch (err) {
            toast.error("Не удалось создать группу", { description: String(err) });
        } finally {
            setSaving(false);
        }
    };

    const totalStudents = classes.reduce((sum, c) => sum + c.memberCount, 0);

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
                        Управляйте группами, добавляйте учеников и назначайте им Mock-тесты.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-6">
                        <div>
                            <p className="text-3xl font-extrabold tabular-nums">{classes.length}</p>
                            <p className="text-xs text-blue-100">{pluralizeRu(classes.length, ["группа", "группы", "групп"])}</p>
                        </div>
                        <div>
                            <p className="text-3xl font-extrabold tabular-nums">{totalStudents}</p>
                            <p className="text-xs text-blue-100">{pluralizeRu(totalStudents, ["ученик", "ученика", "учеников"])}</p>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Мои группы</h2>
                    <div className="flex flex-wrap gap-2">
                      <Link href="/teacher/mock-tests" className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-[0.97]">
                        <FileUp size={16} /> Создать Mock из PDF
                      </Link>
                      {!creating && (
                        <button
                            onClick={() => setCreating(true)}
                            className="inline-flex items-center gap-2 rounded-2xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
                        >
                            <Plus size={16} /> Создать группу
                        </button>
                      )}
                    </div>
                </div>

                {creating && (
                    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                        <input
                            autoFocus
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                            placeholder="Например, 10-A"
                            className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/25"
                        />
                        <button
                            onClick={handleCreate}
                            disabled={saving || newName.trim().length < 1}
                            className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-all hover:opacity-90 disabled:opacity-50"
                        >
                            {saving ? "Создание…" : "Создать"}
                        </button>
                        <button
                            onClick={() => { setCreating(false); setNewName(""); }}
                            className="rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-muted"
                            aria-label="Отмена"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                {loading ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-28 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : classes.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <GraduationCap size={28} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">У вас пока нет групп.</p>
                        <p className="mt-1 text-sm text-muted-foreground/70">Создайте первую группу, чтобы добавить учеников.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {classes.map((cls) => (
                            <Link
                                key={cls.id}
                                href={`/classes/${cls.id}`}
                                className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:bg-muted/40"
                            >
                                <div>
                                    <p className="font-semibold text-foreground">{cls.name}</p>
                                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Users size={12} />
                                        {cls.memberCount} {cls.memberCount === 1 ? "ученик" : "учеников"}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
