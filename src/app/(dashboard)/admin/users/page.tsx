"use client";

import { useEffect, useState } from "react";
import { Phone, Mail, Shield, Calendar, UserCheck, IdCard } from "lucide-react";
import { User as UserType } from "@/lib/firestore-schema";
import supabase from "@/lib/supabase/client";

type AdminUser = UserType & { registeredVia?: string; shortid?: string };

const studentId = (u: AdminUser) => u.shortId || u.shortid || "";

export default function AdminUsersPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("users")
            .select("*")
            .order("createdAt", { ascending: false });
        if (!error && data) setUsers(data as AdminUser[]);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const toggleRegistan = async (u: AdminUser) => {
        await supabase.from("users").update({ isRegistanStudent: !u.isRegistanStudent }).eq("id", u.id);
        load();
    };

    const toggleAdmin = async (u: AdminUser) => {
        const newRole = u.role === "admin" ? "student" : "admin";
        await supabase.from("users").update({ role: newRole }).eq("id", u.id);
        load();
    };

    const filtered = users.filter((u) =>
        (u.name + " " + (u.surname || "") + " " + (u.email || "") + " " + (u.phone || "") + " " + studentId(u))
            .toLowerCase()
            .includes(search.toLowerCase())
    );

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Пользователи</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Все зарегистрированные пользователи. Поиск по имени, email, телефону или Student ID.
                </p>
                <div className="mt-6">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Поиск по ФИО, email, телефону, Student ID…"
                        className="w-full rounded-2xl border border-border bg-background py-3 pl-4 pr-4 text-foreground placeholder:text-muted-foreground transition-colors focus:border-border focus:outline-none focus:ring-2 focus:ring-ring/25"
                    />
                </div>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((n) => (
                            <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">Пользователи ещё не зарегистрировались.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((u) => (
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
                                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            {studentId(u) && <span className="flex items-center gap-1 font-mono font-semibold"><IdCard size={12} />{studentId(u)}</span>}
                                            {u.email && <span className="flex items-center gap-1"><Mail size={12} />{u.email}</span>}
                                            {u.phone && <span className="flex items-center gap-1"><Phone size={12} />{u.phone}</span>}
                                            <span className="flex items-center gap-1"><Calendar size={12} />{new Date(u.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-2">
                                    <button
                                        onClick={() => toggleRegistan(u)}
                                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${u.isRegistanStudent ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                                    >
                                        <UserCheck size={14} />
                                        {u.isRegistanStudent ? "Registan" : "Обычный"}
                                    </button>
                                    <button
                                        onClick={() => toggleAdmin(u)}
                                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${u.role === "admin" ? "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/40" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                                    >
                                        <Shield size={14} />
                                        {u.role === "admin" ? "Админ" : "Ученик"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
