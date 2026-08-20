"use client";

import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    BookOpen,
    Library,
    ListTree,
    HelpCircle,
    ArrowLeft,
    Users,
    ClipboardCheck,
    ListChecks,
    GraduationCap,
    FileText,
    CreditCard,
    QrCode,
} from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuthStore();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!isLoading && (!user || user.role !== "admin")) {
            router.push("/");
        }
    }, [user, isLoading, router]);

    if (isLoading || !user || user.role !== "admin") {
        return (
            <div className="flex min-h-screen items-center justify-center bg-transparent">
                <div className="h-1 w-8 overflow-hidden rounded-full bg-muted">
                    <div className="h-full animate-pulse bg-foreground"></div>
                </div>
            </div>
        );
    }

    const menuItems = [
        { name: "Панель", href: "/admin", icon: LayoutDashboard },
        { name: "Пользователи", href: "/admin/users", icon: Users },
        { name: "Placement", href: "/admin/placement", icon: ClipboardCheck },
        { name: "Результаты Placement", href: "/admin/placement/results", icon: ListChecks },
        { name: "Ученики Registan", href: "/admin/registan", icon: GraduationCap },
        { name: "Mock-тесты", href: "/admin/mock-tests", icon: FileText },
        { name: "Оплаты", href: "/admin/payments", icon: CreditCard },
        { name: "QR для ресепшена", href: "/admin/qr", icon: QrCode },
    ];

    const legacyMenuItems = [
        { name: "Предметы", href: "/admin/subjects", icon: BookOpen },
        { name: "Учебники", href: "/admin/textbooks", icon: Library },
        { name: "Темы", href: "/admin/topics", icon: ListTree },
        { name: "Вопросы", href: "/admin/questions", icon: HelpCircle },
    ];

    return (
        <div className="flex min-h-screen bg-transparent">
            {/* Desktop sidebar */}
            <aside className="hidden md:flex sticky top-0 h-screen w-64 flex-col border-r border-border bg-card shrink-0">
                <div className="flex items-center gap-3 border-b border-border p-8">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-lg font-bold text-background">
                        A
                    </div>
                    <span className="font-semibold tracking-tight text-foreground">Админка</span>
                </div>

                <nav className="mt-4 flex-1 space-y-1 overflow-y-auto p-4">
                    {menuItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                                    isActive
                                        ? "bg-foreground text-background"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                            >
                                <item.icon size={18} />
                                {item.name}
                            </Link>
                        );
                    })}

                    <p className="px-4 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                        Устаревшее
                    </p>
                    {legacyMenuItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                                    isActive
                                        ? "bg-foreground text-background"
                                        : "text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                                }`}
                            >
                                <item.icon size={18} />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>

                <div className="border-t border-border p-4">
                    <Link
                        href="/"
                        className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                    >
                        <ArrowLeft size={18} />
                        Вернуться
                    </Link>
                </div>
            </aside>

            <div className="flex-1 min-w-0 flex flex-col">
                {/* Mobile horizontal tab bar */}
                <div className="md:hidden border-b border-border bg-card shrink-0">
                    <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-none">
                        {menuItems.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                                        isActive
                                            ? "bg-foreground text-background"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                    }`}
                                >
                                    <item.icon size={14} />
                                    {item.name}
                                </Link>
                            );
                        })}
                        <div className="mx-1 h-5 w-px shrink-0 bg-border" />
                        {legacyMenuItems.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                                        isActive
                                            ? "bg-foreground text-background"
                                            : "text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                                    }`}
                                >
                                    <item.icon size={14} />
                                    {item.name}
                                </Link>
                            );
                        })}
                        <Link
                            href="/"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground transition-all shrink-0 ml-auto"
                        >
                            <ArrowLeft size={14} />
                            Назад
                        </Link>
                    </div>
                </div>

                <main className="flex-1 bg-transparent p-4 md:p-12">
                    <div className="mx-auto max-w-5xl">{children}</div>
                </main>
            </div>
        </div>
    );
}
