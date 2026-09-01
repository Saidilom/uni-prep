"use client";

import { useAuthStore } from "@/store/useAuthStore";
import { useSidebarStore } from "@/store/useSidebarStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { APP_NAME } from "@/lib/app-config";
import { useTranslations } from "@/lib/i18n/locale-provider";
import LocaleSwitcher from "@/components/locale-switcher";
import { logOut } from "@/lib/auth-utils";
import {
    LogOut,
    UserPlus,
    GraduationCap,
    ClipboardCheck,
    PanelLeftClose,
    PanelLeft,
} from "lucide-react";

// Deliberately its own isolated layout, same visual language as
// src/app/admin/layout.tsx — but a "staff" account (see 049_staff_role.sql,
// 051_staff_read_placement_results.sql) only ever gets these three
// sections: promote a student to teacher, browse the resulting teacher
// list, and view "Школа" (Placement) entrance test results. Nothing else in
// the app is reachable from here.
export default function StaffLayout({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuthStore();
    const { isCollapsed, toggleCollapsed } = useSidebarStore();
    const router = useRouter();
    const pathname = usePathname();
    const t = useTranslations("staffLayout");

    useEffect(() => {
        if (!isLoading && (!user || user.role !== "staff")) {
            router.push("/");
        }
    }, [user, isLoading, router]);

    if (isLoading || !user || user.role !== "staff") {
        return (
            <div className="flex min-h-screen items-center justify-center bg-transparent">
                <div className="h-1 w-8 overflow-hidden rounded-full bg-muted">
                    <div className="h-full animate-pulse bg-foreground"></div>
                </div>
            </div>
        );
    }

    const menuItems = [
        { name: t("navAssign"), href: "/staff", icon: UserPlus },
        { name: t("navTeachers"), href: "/staff/teachers", icon: GraduationCap },
        { name: t("navPlacementResults"), href: "/staff/placement-results", icon: ClipboardCheck },
    ];

    return (
        <div className="flex min-h-screen bg-transparent">
            {/* Desktop sidebar */}
            <aside className={`hidden md:flex sticky top-0 h-screen flex-col bg-[hsl(var(--brand-olive))] shrink-0 transition-[width] duration-300 ease-in-out ${isCollapsed ? "w-16" : "w-64"}`}>
                <div className={`flex items-center gap-3 border-b border-white/10 p-6 ${isCollapsed ? "flex-col justify-center gap-2 px-0" : ""}`}>
                    <div className="relative h-9 w-9 shrink-0">
                        <Image src="/registan-logo.png" alt={APP_NAME} fill className="object-contain brightness-0 invert" priority />
                    </div>
                    {!isCollapsed && (
                        <div className="min-w-0">
                            <p className="truncate font-bold tracking-tight text-white">{APP_NAME}</p>
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">{t("staffAdmin")}</p>
                        </div>
                    )}
                    <button
                        onClick={toggleCollapsed}
                        className={`rounded-lg p-1.5 hover:bg-white/10 transition-colors ${isCollapsed ? "" : "ml-auto"}`}
                        aria-label={isCollapsed ? t("expandMenu") : t("collapseMenu")}
                        title={isCollapsed ? t("expand") : t("collapse")}
                    >
                        {isCollapsed
                            ? <PanelLeft size={16} className="text-white/70" />
                            : <PanelLeftClose size={16} className="text-white/70" />
                        }
                    </button>
                </div>

                <nav className={`mt-4 flex-1 space-y-1 overflow-y-auto ${isCollapsed ? "px-2" : "p-4"}`}>
                    {menuItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                title={isCollapsed ? item.name : undefined}
                                className={`flex items-center rounded-xl text-sm font-medium transition-all ${
                                    isCollapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3"
                                } ${
                                    isActive
                                        ? "bg-white/15 text-white font-semibold"
                                        : "text-white/65 hover:bg-white/10 hover:text-white"
                                }`}
                            >
                                <item.icon size={18} className="shrink-0" />
                                {!isCollapsed && item.name}
                            </Link>
                        );
                    })}
                </nav>

                <div className={`border-t border-white/10 ${isCollapsed ? "px-2" : "p-4"} py-4`}>
                    {!isCollapsed && (
                        <div className="mb-3">
                            <LocaleSwitcher />
                        </div>
                    )}
                    <button
                        onClick={() => logOut().then(() => router.push("/login"))}
                        title={isCollapsed ? t("logOut") : undefined}
                        className={`flex w-full items-center rounded-lg text-sm font-medium text-white/65 transition-all hover:bg-white/10 hover:text-white ${
                            isCollapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3"
                        }`}
                    >
                        <LogOut size={18} className="shrink-0" />
                        {!isCollapsed && t("logOut")}
                    </button>
                </div>
            </aside>

            <div className="flex-1 min-w-0 flex flex-col">
                {/* Mobile horizontal tab bar */}
                <div className="md:hidden bg-[hsl(var(--brand-olive))] shrink-0">
                    <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-none">
                        {menuItems.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                                        isActive
                                            ? "bg-white/15 text-white font-semibold"
                                            : "text-white/65 hover:bg-white/10 hover:text-white"
                                    }`}
                                >
                                    <item.icon size={14} />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                <main className="flex-1 bg-transparent p-4 md:p-12">
                    <div className="mx-auto max-w-5xl">{children}</div>
                </main>
            </div>
        </div>
    );
}
