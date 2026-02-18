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
    ArrowLeft
} from "lucide-react";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
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
            <div className="flex items-center justify-center min-h-screen bg-transparent">
                <div className="w-8 h-1 bg-neutral-200 rounded-full overflow-hidden">
                    <div className="h-full bg-neutral-900 animate-pulse"></div>
                </div>
            </div>
        );
    }

    const menuItems = [
        { name: "Панель", href: "/admin", icon: LayoutDashboard },
        { name: "Предметы", href: "/admin/subjects", icon: BookOpen },
        { name: "Учебники", href: "/admin/textbooks", icon: Library },
        { name: "Темы", href: "/admin/topics", icon: ListTree },
        { name: "Вопросы", href: "/admin/questions", icon: HelpCircle },
    ];

    return (
        <div className="flex min-h-screen bg-transparent">
            {/* Sidebar */}
            <aside className="w-64 border-r border-neutral-200 flex flex-col sticky top-0 h-screen">
                <div className="p-8 border-b border-neutral-100 flex items-center gap-3">
                    <div className="w-8 h-8 bg-neutral-900 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                        A
                    </div>
                    <span className="font-semibold tracking-tight text-neutral-900">Админка</span>
                </div>

                <nav className="flex-1 p-4 space-y-1 mt-4">
                    {menuItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive
                                    ? "bg-neutral-900 text-white"
                                    : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                                    }`}
                            >
                                <item.icon size={18} />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-neutral-100">
                    <Link
                        href="/"
                        className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 transition-all"
                    >
                        <ArrowLeft size={18} />
                        Вернуться
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-12 bg-transparent">
                <div className="max-w-5xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
