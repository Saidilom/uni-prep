"use client";

import { useEffect, useState } from "react";
import { Users, User as UserIcon } from "lucide-react";
import supabase from "@/lib/supabase/client";

type ClassRow = {
    id: string;
    name: string;
    teacher_id: string;
    created_at: string;
    teacherName: string;
    memberCount: number;
};

export default function AdminClassesPage() {
    const [classes, setClasses] = useState<ClassRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const { data: rows } = await supabase.from("classes").select("*").order("created_at", { ascending: false });
            const classRows = (rows ?? []) as ClassRow[];
            if (classRows.length > 0) {
                const [{ data: teachers }, { data: members }] = await Promise.all([
                    supabase.from("users").select("id, name, surname").in("id", classRows.map((c) => c.teacher_id)),
                    supabase.from("class_members").select("class_id").in("class_id", classRows.map((c) => c.id)),
                ]);
                const teacherMap = new Map((teachers || []).map((t) => [t.id, `${t.name} ${t.surname || ""}`.trim()]));
                const counts = new Map<string, number>();
                (members || []).forEach((m) => counts.set(m.class_id, (counts.get(m.class_id) || 0) + 1));
                classRows.forEach((c) => {
                    c.teacherName = teacherMap.get(c.teacher_id) || "—";
                    c.memberCount = counts.get(c.id) || 0;
                });
            }
            setClasses(classRows);
            setLoading(false);
        })();
    }, []);

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Классы</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Все классы, созданные учителями. Управление — со стороны учителя, на странице класса.
                </p>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : classes.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <Users size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">Классов пока нет.</p>
                        <p className="mt-1 text-sm text-muted-foreground/70">Появятся, когда учитель создаст первый класс.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {classes.map((c) => (
                            <div key={c.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-foreground">{c.name}</p>
                                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <UserIcon size={12} /> {c.teacherName}
                                    </p>
                                </div>
                                <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground sm:self-auto">
                                    <Users size={13} /> {c.memberCount} {c.memberCount === 1 ? "ученик" : "учеников"}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
