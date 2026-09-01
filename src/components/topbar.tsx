"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, GraduationCap, Menu, Search } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useSidebarStore } from "@/store/useSidebarStore";
import { logOut } from "@/lib/auth-utils";
import { APP_NAME } from "@/lib/app-config";
import { useTranslations } from "@/lib/i18n/locale-provider";

type MenuItem = {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    visible?: boolean;
};

type SearchablePage = { name: string; href: string };

export default function Topbar() {
    const router = useRouter();
    const { user } = useAuthStore();
    const { toggle } = useSidebarStore();
    const t = useTranslations("nav");
    const tTopbar = useTranslations("topbar");

    const STUDENT_PAGES: SearchablePage[] = [
        { name: t("home"), href: "/" },
        { name: t("mockTests"), href: "/mock" },
        { name: t("results"), href: "/results" },
        { name: t("school"), href: "/placement" },
        { name: t("achievements"), href: "/achievements" },
        { name: t("myClasses"), href: "/classes" },
        { name: t("profile"), href: "/profile" },
    ];
    const TEACHER_PAGES: SearchablePage[] = [
        { name: t("myTests"), href: "/teacher/mock-tests" },
    ];
    const ADMIN_PAGES: SearchablePage[] = [{ name: t("adminPanel"), href: "/admin" }];

    const [openUser, setOpenUser] = useState(false);
    const [query, setQuery] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);

    const userRef = useRef<HTMLDivElement | null>(null);
    const searchRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);

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

    // Close search dropdown on outside click
    useEffect(() => {
        if (!searchOpen) return;
        const handler = (e: MouseEvent) => {
            if (!(e.target instanceof Node)) return;
            if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [searchOpen]);

    // Cmd/Ctrl+K focuses the search input from anywhere on a dashboard page,
    // matching the shortcut convention most users already expect.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, []);

    const searchablePages: SearchablePage[] = !user ? [] : [
        ...STUDENT_PAGES,
        ...(user.role === "teacher" ? TEACHER_PAGES : []),
        ...(user.role === "admin" ? ADMIN_PAGES : []),
    ];

    const searchQuery = query.trim().toLowerCase();
    const searchResults = !searchQuery
        ? searchablePages
        : searchablePages.filter((p) => p.name.toLowerCase().includes(searchQuery));

    const goToPage = (href: string) => {
        setSearchOpen(false);
        setQuery("");
        searchInputRef.current?.blur();
        router.push(href);
    };

    const userMenu: MenuItem[] = [
        { label: t("myClasses"), href: "/classes", icon: GraduationCap, visible: user?.role === "teacher" || user?.role === "student" },
    ].filter((i) => i.visible);

    if (!user) return null;

    const roleLabel = user.role === "admin" ? tTopbar("roleAdmin") : user.role === "teacher" ? tTopbar("roleTeacher") : tTopbar("roleStudent");

    return (
        <div className="sticky top-0 z-40 shrink-0 bg-background/80 backdrop-blur-md">
            <div className="h-16 px-4 md:px-8 flex items-center gap-3">

                {/* Hamburger — mobile only */}
                <button
                    onClick={toggle}
                    className="md:hidden p-2 -ml-1 rounded-lg hover:bg-muted transition-colors"
                    aria-label={tTopbar("openMenu")}
                >
                    <Menu className="w-5 h-5 text-foreground" />
                </button>

                {/* App name — mobile only */}
                <span className="md:hidden font-extrabold text-base text-foreground tracking-tight">{APP_NAME}</span>

                {/* Quick page search — desktop only, mobile relies on the sidebar */}
                <div ref={searchRef} className="relative hidden flex-1 md:block">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onFocus={() => setSearchOpen(true)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && searchResults[0]) goToPage(searchResults[0].href);
                                if (e.key === "Escape") { setSearchOpen(false); searchInputRef.current?.blur(); }
                            }}
                            placeholder={tTopbar("searchPlaceholder")}
                            className="h-10 w-full rounded-xl border border-border bg-muted/50 pl-10 pr-14 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/15"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:flex">
                            ⌘K
                        </span>
                    </div>

                    {searchOpen && (
                        <div className="absolute left-0 right-0 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-border bg-card shadow-lg z-10 origin-top animate-in fade-in-0 zoom-in-95 duration-150">
                            {searchResults.length === 0 ? (
                                <p className="px-4 py-3 text-sm text-muted-foreground">{tTopbar("noResultsFound")}</p>
                            ) : (
                                <div className="py-1.5">
                                    {searchResults.map((page) => (
                                        <button
                                            key={page.href}
                                            type="button"
                                            onClick={() => goToPage(page.href)}
                                            className="mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                                        >
                                            {page.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex-1 md:hidden" />

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
                        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-border bg-card shadow-lg overflow-hidden z-10 origin-top-right animate-in fade-in-0 zoom-in-95 duration-150">
                            <div className="px-4 py-3.5 flex items-center gap-3 bg-muted/40">
                                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground text-sm font-black flex items-center justify-center shrink-0">
                                    {(user.name?.[0] || "U").toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-bold text-foreground truncate">
                                        {user.name} {user.surname || ""}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                                </div>
                                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 rounded-full px-2 py-1">
                                    {roleLabel}
                                </span>
                            </div>

                            {userMenu.length > 0 && (
                                <div className="py-1.5 border-t border-border">
                                    {userMenu.map((item) => {
                                        const Icon = item.icon;
                                        return (
                                            <Link
                                                key={item.label}
                                                href={item.href}
                                                onClick={() => setOpenUser(false)}
                                                className="mx-1.5 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors flex items-center gap-3"
                                            >
                                                <Icon className="w-4 h-4 text-muted-foreground" />
                                                <span className="text-sm font-semibold text-foreground">{item.label}</span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="py-1.5 border-t border-border">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        setOpenUser(false);
                                        await logOut();
                                        router.push("/login");
                                    }}
                                    className="mx-1.5 px-3 py-2.5 rounded-xl hover:bg-destructive/10 transition-colors flex items-center gap-3 text-left"
                                >
                                    <LogOut className="w-4 h-4 text-destructive" />
                                    <span className="text-sm font-semibold text-destructive">{tTopbar("logout")}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
