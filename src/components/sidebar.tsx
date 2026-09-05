"use client";

import { memo, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { useSidebarStore } from "@/store/useSidebarStore";
import { fetchHasReviewAssignments } from "@/lib/class-utils";
import { APP_NAME } from "@/lib/app-config";
import { useTranslations } from "@/lib/i18n/locale-provider";
import LocaleSwitcher from "@/components/locale-switcher";
import {
    LayoutDashboard,
    CircleUserRound,
    GraduationCap,
    Trophy,
    FileText,
    BarChart3,
    ClipboardCheck,
    Shield,
    X,
    PanelLeftClose,
    PanelLeft,
} from "lucide-react";

function Sidebar() {
    const { user } = useAuthStore();
    const { isOpen, isCollapsed, close, toggleCollapsed } = useSidebarStore();
    const pathname = usePathname();
    const t = useTranslations("nav");
    // Пункт «Проверка работ» появляется, только если этому аккаунту назначили
    // хоть один мок (миграция 080). Показывать его всем учителям незачем — у
    // большинства он всегда пустой.
    const [hasReviewWork, setHasReviewWork] = useState(false);

    useEffect(() => { close(); }, [pathname, close]);

    useEffect(() => {
        if (!user || user.role === "student") return;
        fetchHasReviewAssignments(user.id).then(setHasReviewWork).catch(() => setHasReviewWork(false));
    }, [user]);

    if (!user) return null;

    const isTeacher = user.role === "teacher";
    const isStudent = user.role === "student";
    const isAdmin = user.role === "admin";
    const links = [
        { name: t("home"), href: "/", icon: LayoutDashboard },
        ...(isTeacher || isStudent ? [{ name: t("myClasses"), href: "/classes", icon: GraduationCap }] : []),
        ...(isTeacher ? [{ name: t("myTests"), href: "/teacher/mock-tests", icon: FileText }] : []),
        ...(hasReviewWork ? [{ name: t("reviewWork"), href: "/review", icon: ClipboardCheck }] : []),
        { name: t("mockTests"), href: "/mock", icon: FileText },
        { name: t("results"), href: "/results", icon: BarChart3 },
        ...(isStudent ? [{ name: t("rating"), href: "/rating", icon: Trophy }] : []),
        { name: t("profile"), href: "/profile", icon: CircleUserRound },
        ...(isAdmin ? [{ name: t("admin"), href: "/admin", icon: Shield }] : []),
    ];

    return (
        <>
            {/* Overlay — mobile only */}
            {isOpen && (
                <div onClick={close} className="fixed inset-0 bg-black/40 z-40 md:hidden" aria-hidden="true" />
            )}

            <aside
                className={`
                    fixed left-0 top-0 h-screen bg-[hsl(var(--brand-olive))] flex flex-col z-50
                    overflow-y-auto overflow-x-hidden
                    transition-[width,transform] duration-300 ease-in-out
                    w-64
                    ${isOpen ? "translate-x-0" : "-translate-x-full"}
                    ${isCollapsed ? "md:w-16 md:translate-x-0" : "md:w-64 md:translate-x-0"}
                `}
            >
                {/* ── Logo ── */}
                <div className={`shrink-0 pt-5 pb-4 flex items-center justify-between border-b border-white/10 px-5 ${isCollapsed ? "md:flex-col md:justify-center md:gap-2 md:px-0" : ""}`}>
                    {/* Full logo — hidden when collapsed on desktop */}
                    <Link href="/" className={`flex flex-1 items-center justify-center ${isCollapsed ? "md:hidden" : ""}`} onClick={close}>
                        <div className="relative h-14 w-44">
                            <Image src="/registan-logo.png" alt={APP_NAME} fill className="object-contain brightness-0 invert" priority />
                        </div>
                    </Link>

                    {/* Collapsed: just the logo icon */}
                    {isCollapsed && (
                        <Link href="/" className="hidden md:flex items-center justify-center" onClick={close} title={APP_NAME}>
                            <div className="relative h-10 w-10">
                                <Image src="/registan-logo.png" alt={APP_NAME} fill className="object-contain brightness-0 invert" priority />
                            </div>
                        </Link>
                    )}

                    {/* Mobile: close drawer */}
                    <button onClick={close} className="md:hidden p-1.5 rounded-lg hover:bg-white/10 transition-colors" aria-label={t("closeMenu")}>
                        <X size={18} className="text-white/70" />
                    </button>

                    {/* Desktop: collapse/expand toggle */}
                    <button
                        onClick={toggleCollapsed}
                        className="hidden md:flex p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        aria-label={isCollapsed ? t("expandMenu") : t("collapseMenu")}
                        title={isCollapsed ? t("expand") : t("collapse")}
                    >
                        {isCollapsed
                            ? <PanelLeft size={16} className="text-white/70" />
                            : <PanelLeftClose size={16} className="text-white/70" />
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
                                            ${active ? "bg-white/15 text-white font-semibold" : "text-white/65 hover:text-white hover:bg-white/10"}`}
                                    >
                                        <Icon
                                            size={18}
                                            className={`flex-shrink-0 transition-colors duration-100 ${active ? "text-white" : "text-white/65"}`}
                                        />
                                        <span className={isCollapsed ? "md:hidden" : ""}>{name}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* ── User ── */}
                <div className={`pt-2 pb-4 border-t border-white/10 mt-auto flex-1 flex flex-col justify-end ${isCollapsed ? "md:px-2 px-3" : "px-3"}`}>
                    {!isCollapsed && (
                        <div className="px-3 pb-3">
                            <LocaleSwitcher />
                        </div>
                    )}
                    <div className={`flex items-center rounded-lg py-2 ${isCollapsed ? "md:justify-center md:px-0 px-3 gap-3" : "px-3 gap-3"}`}>
                        <div
                            className="w-7 h-7 rounded-full bg-white text-[hsl(var(--brand-olive-ink))] flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                            title={isCollapsed ? `${user.name} ${user.surname || ""}` : undefined}
                        >
                            {user.name[0].toUpperCase()}
                        </div>
                        <div className={`flex-1 min-w-0 ${isCollapsed ? "md:hidden" : ""}`}>
                            <p className="text-[12.5px] font-semibold text-white truncate leading-tight">
                                {user.name} {user.surname || ""}
                            </p>
                            <p className="mt-1 text-[11px] font-semibold text-white/60 truncate">{user.email}</p>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}

export default memo(Sidebar);
