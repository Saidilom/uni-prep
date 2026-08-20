"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, LogOut, User2, GraduationCap, Shield, Menu, X, BookOpen } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useSubjectsStore } from "@/store/useSubjectsStore";
import { useSidebarStore } from "@/store/useSidebarStore";
import { logOut } from "@/lib/auth-utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/app-config";

type MenuItem = {
    label: string;
    href?: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick?: () => void;
    visible?: boolean;
};

export default function Topbar() {
    const router = useRouter();
    const { user } = useAuthStore();
    const { subjects } = useSubjectsStore();
    const { toggle } = useSidebarStore();

    const [query, setQuery] = useState("");
    const [openSearch, setOpenSearch] = useState(false);
    const [openUser, setOpenUser] = useState(false);

    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const userRef = useRef<HTMLDivElement | null>(null);

    // Close user menu on outside click
    useEffect(() => {
        if (!openUser) return;
        const handler = (e: MouseEvent) => {
            if (!(e.target instanceof Node)) return;
            if (userRef.current && !userRef.current.contains(e.target)) setOpenUser(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [openUser]);

    // Auto-focus input when modal opens
    useEffect(() => {
        if (openSearch) {
            setTimeout(() => searchInputRef.current?.focus(), 30);
        } else {
            setQuery("");
        }
    }, [openSearch]);

    // Close on Escape
    useEffect(() => {
        if (!openSearch) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpenSearch(false);
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [openSearch]);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q.length < 1) return [];
        return subjects
            .filter((s) => s.name.toLowerCase().includes(q))
            .slice(0, 8)
            .map((s) => ({ id: s.id, label: s.name, href: `/subject/${s.id}` }));
    }, [query, subjects]);

    const userMenu: MenuItem[] = [
        { label: "Профиль", href: "/profile", icon: User2, visible: true },
        { label: "Мои классы", href: "/classes", icon: GraduationCap, visible: user?.role === "teacher" },
        { label: "Админ", href: "/admin", icon: Shield, visible: user?.role === "admin" },
        {
            label: "Выйти",
            icon: LogOut,
            visible: true,
            onClick: async () => {
                await logOut();
                router.push("/login");
            },
        },
    ].filter((i) => i.visible);

    const handleSelect = (href: string) => {
        router.push(href);
        setOpenSearch(false);
    };

    if (!user) return null;

    return (
        <>
            {/* ── Search Modal ── */}
            {openSearch && (
                <div
                    className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[10vh] pb-8"
                    onClick={() => setOpenSearch(false)}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

                    {/* Modal */}
                    <div
                        className="relative w-full max-w-lg bg-card rounded-3xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Input row */}
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                            <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                            <input
                                ref={searchInputRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && results[0]) handleSelect(results[0].href);
                                }}
                                placeholder="Поиск по предметам…"
                                className="flex-1 bg-transparent text-[15px] font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
                            />
                            <button
                                onClick={() => setOpenSearch(false)}
                                className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
                            >
                                <X className="w-4 h-4 text-muted-foreground" />
                            </button>
                        </div>

                        {/* Results / Empty state */}
                        <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
                            {query.trim().length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                                    <Search className="w-9 h-9 opacity-20" />
                                    <p className="text-sm font-medium">Введите название предмета</p>
                                </div>
                            ) : results.length > 0 ? (
                                <div className="py-2">
                                    {results.map((r) => (
                                        <button
                                            key={r.id}
                                            type="button"
                                            onClick={() => handleSelect(r.href)}
                                            className="w-full flex items-center gap-4 px-5 py-3 hover:bg-muted transition-colors text-left group"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-background transition-colors">
                                                <BookOpen className="w-4 h-4 text-muted-foreground" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-foreground truncate">{r.label}</div>
                                                <div className="text-[11px] text-muted-foreground mt-0.5">Открыть предмет</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                                    <p className="text-sm font-medium">Ничего не найдено</p>
                                    <p className="text-xs">Попробуйте другой запрос</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Topbar ── */}
            <div className="sticky top-0 z-40 shrink-0 bg-background/80 backdrop-blur-md">
                <div className="h-16 px-4 md:px-8 flex items-center gap-3">

                    {/* Hamburger — mobile only */}
                    <button
                        onClick={toggle}
                        className="md:hidden p-2 -ml-1 rounded-lg hover:bg-muted transition-colors"
                        aria-label="Открыть меню"
                    >
                        <Menu className="w-5 h-5 text-foreground" />
                    </button>

                    {/* App name — mobile only */}
                    <span className="md:hidden font-extrabold text-base text-foreground tracking-tight">{APP_NAME}</span>

                    {/* Desktop search trigger */}
                    <button
                        onClick={() => setOpenSearch(true)}
                        className="hidden md:flex items-center gap-3 h-10 pl-4 pr-5 rounded-2xl border border-border bg-muted/50 hover:bg-muted transition-colors w-[min(400px,40vw)]"
                    >
                        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm text-muted-foreground font-medium flex-1 text-left">Поиск по предметам…</span>
                    </button>

                    <div className="flex-1" />

                    {/* Mobile search icon */}
                    <button
                        onClick={() => setOpenSearch(true)}
                        className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors"
                        aria-label="Поиск"
                    >
                        <Search className="w-5 h-5 text-muted-foreground" />
                    </button>

                    <ThemeToggle />

                    {/* User menu */}
                    <div ref={userRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setOpenUser((v) => !v)}
                            className="h-10 pl-3 pr-2 rounded-full border border-border bg-card hover:bg-muted transition-colors inline-flex items-center gap-2"
                        >
                            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-[11px] font-black flex items-center justify-center">
                                {(user.name?.[0] || "U").toUpperCase()}
                            </div>
                            <div className="hidden sm:flex flex-col items-start leading-tight">
                                <span className="text-xs font-bold text-foreground">
                                    {user.name} {user.surname || ""}
                                </span>
                            </div>
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        </button>

                        {openUser && (
                            <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-border bg-card shadow-sm overflow-hidden z-10">
                                <div className="px-4 py-3 border-b border-border">
                                    <div className="text-sm font-bold text-foreground">
                                        {user.name} {user.surname || ""}
                                    </div>
                                </div>
                                <div className="py-1">
                                    {userMenu.map((item) => {
                                        const Icon = item.icon;
                                        if (item.href) {
                                            return (
                                                <Link
                                                    key={item.label}
                                                    href={item.href}
                                                    onClick={() => setOpenUser(false)}
                                                    className="px-4 py-2.5 hover:bg-muted transition-colors flex items-center gap-3"
                                                >
                                                    <Icon className="w-4 h-4 text-muted-foreground" />
                                                    <span className="text-sm font-semibold text-foreground">{item.label}</span>
                                                </Link>
                                            );
                                        }
                                        return (
                                            <button
                                                key={item.label}
                                                type="button"
                                                onClick={() => {
                                                    setOpenUser(false);
                                                    item.onClick?.();
                                                }}
                                                className="w-full px-4 py-2.5 hover:bg-muted transition-colors flex items-center gap-3 text-left"
                                            >
                                                <Icon className="w-4 h-4 text-muted-foreground" />
                                                <span className="text-sm font-semibold text-foreground">{item.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
