"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, User2, GraduationCap, Shield, Menu } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
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

    if (!user) return null;

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
    );
}
