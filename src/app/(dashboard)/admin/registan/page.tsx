"use client";

import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { User } from "@/lib/firestore-schema";
import supabase from "@/lib/supabase/client";

export default function AdminRegistanPage() {
    const [students, setStudents] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        const { data } = await supabase.from("users").select("*").eq("isRegistanStudent", true).order("createdAt", { ascending: false });
        if (data) setStudents(data as User[]);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const toggleStatus = async (u: User) => {
        await supabase.from("users").update({ isRegistanStudent: !u.isRegistanStudent }).eq("id", u.id);
        load();
    };

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Ученики Registan</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Пользователи со статусом «Ученик Registan». Им доступны бесплатные Mock-тесты.
                </p>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-20 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : students.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">Пока нет учеников со статусом Registan.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {students.map((u) => (
                            <div
                                key={u.id}
                                className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:bg-muted/40 sm:flex-row sm:items-center"
                            >
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted font-bold text-foreground shadow-sm">
                                        {u.name?.[0]?.toUpperCase() || "?"}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">
                                            {u.name} {u.surname || ""}
                                        </p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">{u.email || u.phone || "—"}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => toggleStatus(u)}
                                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors"
                                >
                                    <GraduationCap size={16} /> Снять статус
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
