"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, GraduationCap, Menu } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useSidebarStore } from "@/store/useSidebarStore";
import { logOut } from "@/lib/auth-utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/app-config";

type MenuItem = {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    visible?: boolean;
};

export default function Topbar() {
    const router = useRouter();
    const { user } = useAuthStore();
    const { toggle } = useSidebarStore();

    const [openUser, setOpenUser] = useState(false);

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

    const userMenu: MenuItem[] = [
        { label: "Мои группы", href: "/classes", icon: GraduationCap, visible: user?.role === "teacher" },
    ].filter((i) => i.visible);

    if (!user) return null;

    const roleLabel = user.role === "admin" ? "Администратор" : user.role === "teacher" ? "Учитель" : "Ученик";

    return (
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

                <div className="flex-1" />

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
                                    <span className="text-sm font-semibold text-destructive">Выйти</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
