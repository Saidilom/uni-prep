"use client";

import { memo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { useSidebarStore } from "@/store/useSidebarStore";
import { APP_NAME } from "@/lib/app-config";
import {
    LayoutDashboard,
    CircleUserRound,
    GraduationCap,
    ClipboardCheck,
    FileText,
    Settings,
    X,
    PanelLeftClose,
    PanelLeft,
} from "lucide-react";

const mainLinks = (isTeacher: boolean) => [
    { name: "Главная", href: "/", icon: LayoutDashboard },
    ...(isTeacher ? [{ name: "Мои классы", href: "/classes", icon: GraduationCap }] : []),
    { name: "Вступительный тест", href: "/placement", icon: ClipboardCheck },
    { name: "Mock-тесты", href: "/mock", icon: FileText },
    { name: "Мой профиль", href: "/profile", icon: CircleUserRound },
];

function Sidebar() {
    const { user } = useAuthStore();
    const { isOpen, isCollapsed, close, toggleCollapsed } = useSidebarStore();
    const pathname = usePathname();

    useEffect(() => { close(); }, [pathname, close]);

    if (!user) return null;

    const links = mainLinks(user.role === "teacher");

    return (
        <>
            {/* Overlay — mobile only */}
            {isOpen && (
                <div onClick={close} className="fixed inset-0 bg-black/40 z-40 md:hidden" aria-hidden="true" />
            )}

            <aside
                className={`
                    fixed left-0 top-0 h-screen bg-background border-r border-border flex flex-col z-50
                    overflow-y-auto overflow-x-hidden
                    transition-[width,transform] duration-300 ease-in-out
                    w-64
                    ${isOpen ? "translate-x-0" : "-translate-x-full"}
                    ${isCollapsed ? "md:w-16 md:translate-x-0" : "md:w-64 md:translate-x-0"}
                `}
            >
                {/* ── Logo ── */}
                <div className={`shrink-0 pt-4 pb-3 flex items-center border-b border-border ${isCollapsed ? "md:justify-center md:px-0 px-5 justify-between" : "px-5 justify-between"}`}>
                    {/* Full logo — hidden when collapsed on desktop */}
                    <Link href="/" className={`flex items-center gap-3 ${isCollapsed ? "md:hidden" : ""}`} onClick={close}>
                        <div className="relative w-10 h-10 flex-shrink-0">
                            <Image src="/gogg.png" alt={APP_NAME} fill className="object-contain" priority />
                        </div>
                        <span className="text-lg font-extrabold tracking-tight text-foreground">{APP_NAME}</span>
                    </Link>

                    {/* Collapsed: just the logo icon */}
                    {isCollapsed && (
                        <Link href="/" className="hidden md:flex items-center justify-center" onClick={close} title={APP_NAME}>
                            <div className="relative w-8 h-8 flex-shrink-0">
                                <Image src="/gogg.png" alt={APP_NAME} fill className="object-contain" priority />
                            </div>
                        </Link>
                    )}

                    {/* Mobile: close drawer */}
                    <button onClick={close} className="md:hidden p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Закрыть меню">
                        <X size={18} className="text-muted-foreground" />
                    </button>

                    {/* Desktop: collapse/expand toggle */}
                    <button
                        onClick={toggleCollapsed}
                        className={`hidden md:flex p-1.5 rounded-lg hover:bg-muted transition-colors ${isCollapsed ? "mt-2" : ""}`}
                        aria-label={isCollapsed ? "Развернуть меню" : "Свернуть меню"}
                        title={isCollapsed ? "Развернуть" : "Свернуть"}
                    >
                        {isCollapsed
                            ? <PanelLeft size={16} className="text-muted-foreground" />
                            : <PanelLeftClose size={16} className="text-muted-foreground" />
                        }
                    </button>
                </div>

                {/* ── Main navigation ── */}
                <nav className={`pt-3 pb-2 ${isCollapsed ? "md:px-2 px-3" : "px-3"}`}>
                    <ul className="flex flex-col gap-0.5">
                        {links.map(({ name, href, icon: Icon }) => {
                            const active = pathname === href;
                            return (
                                <li key={href}>
                                    <Link
                                        href={href}
                                        title={isCollapsed ? name : undefined}
                                        className={`flex items-center rounded-lg text-[13.5px] font-medium transition-colors duration-100
                                            ${isCollapsed ? "md:justify-center md:px-0 md:py-2.5 gap-3 px-3 py-2.5" : "gap-3 px-3 py-2.5"}
                                            ${active ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                                    >
                                        <Icon
                                            size={18}
                                            className={`flex-shrink-0 transition-colors duration-100 ${active ? "text-foreground" : "text-muted-foreground"}`}
                                        />
                                        <span className={isCollapsed ? "md:hidden" : ""}>{name}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* ── User ── */}
                <div className={`pt-2 pb-4 border-t border-border mt-auto flex-1 flex flex-col justify-end ${isCollapsed ? "md:px-2 px-3" : "px-3"}`}>
                    <div className={`flex items-center rounded-lg py-2 ${isCollapsed ? "md:justify-center md:px-0 px-3 gap-3" : "px-3 gap-3"}`}>
                        <div
                            className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[11px] font-bold flex-shrink-0"
                            title={isCollapsed ? `${user.name} ${user.surname || ""}` : undefined}
                        >
                            {user.name[0].toUpperCase()}
                        </div>
                        <div className={`flex-1 min-w-0 ${isCollapsed ? "md:hidden" : ""}`}>
                            <p className="text-[12.5px] font-semibold text-foreground truncate leading-tight">
                                {user.name} {user.surname || ""}
                            </p>
                            <Link
                                href="/settings"
                                className="mt-1 inline-flex items-center gap-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <Settings size={12} className="text-muted-foreground" />
                                Настройки
                            </Link>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}

export default memo(Sidebar);
