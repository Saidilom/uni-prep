"use client";

import { useEffect, useState } from "react";
import { Laptop, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

type Session = {
    id: string;
    created_at: string;
    updated_at: string | null;
    user_agent: string | null;
    ip: string | null;
    not_after: string | null;
};

// Устройство/браузер — грубый разбор без новой зависимости: своей задачи
// (отличить «это Chrome на телефоне» от «это Safari на маке») хватает и без
// полноценного UA-парсера.
function describeUserAgent(ua: string | null): string {
    if (!ua) return "—";
    const isMobile = /Mobile|Android|iPhone/i.test(ua);
    const browser = /Edg\//.test(ua) ? "Edge"
        : /Chrome\//.test(ua) ? "Chrome"
        : /Firefox\//.test(ua) ? "Firefox"
        : /Safari\//.test(ua) ? "Safari"
        : "Браузер";
    const os = /Windows/.test(ua) ? "Windows"
        : /Mac OS X/.test(ua) ? "macOS"
        : /Android/.test(ua) ? "Android"
        : /iPhone|iPad/.test(ua) ? "iOS"
        : /Linux/.test(ua) ? "Linux"
        : "";
    return [browser, os, isMobile ? "(моб.)" : ""].filter(Boolean).join(" ");
}

export default function ActiveSessionsPanel() {
    const t = useTranslations("profile");
    const { locale } = useLocale();
    const [sessions, setSessions] = useState<Session[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [revokingOthers, setRevokingOthers] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    const load = async () => {
        try {
            const res = await fetch("/api/profile/sessions");
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || t("sessionsError"));
            setSessions(body.sessions ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : t("sessionsError"));
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const revoke = async (id: string) => {
        setRevokingId(id);
        setError(null);
        try {
            const res = await fetch(`/api/profile/sessions/${id}/revoke`, { method: "POST" });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || t("sessionRevokeError"));
            setSessions((prev) => (prev ?? []).filter((s) => s.id !== id));
        } catch (err) {
            setError(err instanceof Error ? err.message : t("sessionRevokeError"));
        } finally {
            setRevokingId(null);
        }
    };

    const revokeOthers = async () => {
        if (!window.confirm(t("sessionRevokeOthersConfirm"))) return;
        setRevokingOthers(true);
        setError(null);
        setNotice(null);
        try {
            const res = await fetch("/api/profile/sessions/revoke-others", { method: "POST" });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || t("sessionRevokeOthersError"));
            setNotice(t("sessionRevokeOthersDone"));
            void load();
        } catch (err) {
            setError(err instanceof Error ? err.message : t("sessionRevokeOthersError"));
        } finally {
            setRevokingOthers(false);
        }
    };

    return (
        <section>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold tracking-tight text-[hsl(var(--brand-blue-ink))]">{t("sessionsSection")}</h2>
                {sessions && sessions.length > 1 && (
                    <button
                        onClick={revokeOthers}
                        disabled={revokingOthers}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                        <LogOut size={13} /> {t("sessionRevokeOthers")}
                    </button>
                )}
            </div>
            <p className="mb-4 text-sm text-muted-foreground">{t("sessionsSubtitle")}</p>

            {error && (
                <div role="alert" className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}
            {notice && (
                <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    {notice}
                </div>
            )}

            {sessions === null ? (
                <div className="space-y-2">
                    {[1, 2].map((n) => <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />)}
                </div>
            ) : sessions.length === 0 ? (
                <div className="rounded-2xl border border-border bg-muted/50 py-8 text-center dark:bg-muted/30">
                    <p className="font-medium text-muted-foreground">{t("sessionsEmpty")}</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {sessions.map((s) => (
                        <div key={s.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                                    <Laptop size={16} />
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">{describeUserAgent(s.user_agent)}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {s.ip ? `${s.ip} · ` : ""}
                                        {t("sessionLastActive")} {new Date(s.updated_at ?? s.created_at).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ")}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => revoke(s.id)}
                                disabled={revokingId === s.id}
                                className="shrink-0 self-start rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50 sm:self-auto"
                            >
                                {t("sessionRevoke")}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
