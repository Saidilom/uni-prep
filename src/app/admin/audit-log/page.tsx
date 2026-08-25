"use client";

import { useEffect, useMemo, useState } from "react";
import { LogIn, ShieldAlert, ClipboardCheck, Wallet } from "lucide-react";
import supabase from "@/lib/supabase/client";

type AuditRow = {
    id: string;
    actor_id: string | null;
    action: string;
    target_type: string;
    target_id: string | null;
    details: Record<string, unknown>;
    created_at: string;
};

type ActorInfo = { name: string; surname: string | null; email: string };

const actionMeta: Record<string, { label: string; icon: typeof LogIn; accent: string }> = {
    login: { label: "Вход", icon: LogIn, accent: "text-blue-600 bg-blue-50 dark:bg-blue-950/40" },
    role_change: { label: "Смена роли", icon: ShieldAlert, accent: "text-violet-600 bg-violet-50 dark:bg-violet-950/40" },
    test_assigned: { label: "Назначение теста", icon: ClipboardCheck, accent: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
    payment: { label: "Оплата", icon: Wallet, accent: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" },
};

const describeDetails = (row: AuditRow): string => {
    const d = row.details || {};
    switch (row.action) {
        case "login":
            return String(d.email || "");
        case "role_change":
            return `${d.targetName || ""} ${d.targetSurname || ""}: ${d.from || "?"} → ${d.to || "?"}`.trim();
        case "test_assigned":
            if (row.target_type === "placement_assignment") return `Placement «${d.testTitle || "?"}»`;
            return `Mock «${d.mockTitle || "?"}» → класс «${d.className || "?"}»`;
        case "payment":
            return `${d.amount ?? "?"} ${d.currency || "UZS"} • ${d.mockTestTitle || "?"} • ${d.provider || "?"}`;
        default:
            return JSON.stringify(d);
    }
};

export default function AdminAuditLogPage() {
    const [rows, setRows] = useState<AuditRow[]>([]);
    const [actors, setActors] = useState<Record<string, ActorInfo>>({});
    const [loading, setLoading] = useState(true);
    const [actionFilter, setActionFilter] = useState("");

    useEffect(() => {
        (async () => {
            setLoading(true);
            const { data } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200);
            const list = (data || []) as AuditRow[];
            setRows(list);

            const actorIds = Array.from(new Set(list.map((r) => r.actor_id).filter((id): id is string => !!id)));
            if (actorIds.length > 0) {
                const { data: users } = await supabase.from("users").select("id, name, surname, email").in("id", actorIds);
                const map: Record<string, ActorInfo> = {};
                (users || []).forEach((u) => { map[u.id as string] = { name: u.name as string, surname: u.surname as string | null, email: u.email as string }; });
                setActors(map);
            }
            setLoading(false);
        })();
    }, []);

    const filtered = useMemo(() => (actionFilter ? rows.filter((r) => r.action === actionFilter) : rows), [rows, actionFilter]);

    const fmtDate = (d: string) => new Date(d).toLocaleString("ru-RU");

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Аудит-лог</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Критические действия: входы, смена ролей, назначения тестов, оплаты. Записи создаются триггерами базы данных — их нельзя подделать из приложения.
                </p>
            </section>

            <section className="flex flex-wrap gap-2">
                {[
                    { value: "", label: "Все" },
                    { value: "login", label: "Входы" },
                    { value: "role_change", label: "Смена ролей" },
                    { value: "test_assigned", label: "Назначения тестов" },
                    { value: "payment", label: "Оплаты" },
                ].map((f) => (
                    <button
                        key={f.value}
                        onClick={() => setActionFilter(f.value)}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${actionFilter === f.value ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:bg-muted"}`}
                    >
                        {f.label}
                    </button>
                ))}
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3, 4].map((n) => <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">Пока нет записей.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filtered.map((row) => {
                            const meta = actionMeta[row.action] || { label: row.action, icon: ClipboardCheck, accent: "text-muted-foreground bg-muted" };
                            const actor = row.actor_id ? actors[row.actor_id] : null;
                            const actorLabel = actor ? `${actor.name} ${actor.surname || ""}`.trim() || actor.email : (row.actor_id || "система");
                            return (
                                <div key={row.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.accent}`}>
                                        <meta.icon size={18} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-foreground">{meta.label} — {actorLabel}</p>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{describeDetails(row)}</p>
                                    </div>
                                    <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(row.created_at)}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
