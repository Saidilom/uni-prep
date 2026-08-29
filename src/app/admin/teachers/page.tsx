"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Mail, Phone, Users } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { User as UserType } from "@/lib/firestore-schema";
import { pluralizeRu } from "@/lib/pluralize-ru";

type TeacherRow = UserType & { shortid?: string; classCount: number };

export default function AdminTeachersPage() {
    const [teachers, setTeachers] = useState<TeacherRow[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        const { data: users } = await supabase.from("users").select("*").eq("role", "teacher").order("createdAt", { ascending: false });
        const teacherRows = (users ?? []) as TeacherRow[];
        if (teacherRows.length > 0) {
            const { data: classes } = await supabase.from("classes").select("teacher_id").in("teacher_id", teacherRows.map((t) => t.id));
            const counts = new Map<string, number>();
            (classes || []).forEach((c) => counts.set(c.teacher_id, (counts.get(c.teacher_id) || 0) + 1));
            teacherRows.forEach((t) => { t.classCount = counts.get(t.id) || 0; });
        }
        setTeachers(teacherRows);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const filtered = teachers.filter((t) =>
        (t.name + " " + (t.surname || "") + " " + (t.email || "")).toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Учителя</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Все пользователи с ролью «Учитель». Назначить роль можно на странице{" "}
                    <Link href="/admin/users" className="font-semibold text-[hsl(var(--brand-blue-ink))] hover:underline">Пользователи</Link>.
                </p>
                <div className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3">
                    <Search size={16} className="shrink-0 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Поиск по имени или email…"
                        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                </div>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <Users size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{teachers.length === 0 ? "Пока нет учителей." : "Ничего не найдено."}</p>
                        {teachers.length === 0 && (
                            <p className="mt-1 text-sm text-muted-foreground/70">
                                Назначьте роль учителя пользователю на странице «Пользователи».
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((t) => (
                            <div key={t.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:bg-muted/40 sm:flex-row sm:items-center">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))]/10 font-bold text-[hsl(var(--brand-blue-ink))]">
                                        {t.name?.[0]?.toUpperCase() || "?"}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{t.name} {t.surname || ""}</p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            {t.email && <span className="flex items-center gap-1"><Mail size={12} />{t.email}</span>}
                                            {t.phone && <span className="flex items-center gap-1"><Phone size={12} />{t.phone}</span>}
                                        </div>
                                    </div>
                                </div>
                                <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground sm:self-auto">
                                    <Users size={13} /> {t.classCount} {pluralizeRu(t.classCount, ["группа", "группы", "групп"])}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
