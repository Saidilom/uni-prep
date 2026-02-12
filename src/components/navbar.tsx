"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { logOut } from "@/lib/auth-utils";

export default function Navbar() {
    const { user } = useAuthStore();
    const pathname = usePathname();

    const handleLogout = async () => {
        if (confirm("Вы уверены, что хотите выйти?")) {
            await logOut();
        }
    };

    if (!user) return null;

    const isTeacher = user.role === "teacher";

    const navLinks = [
        { name: "Главная", href: "/" },
        ...(isTeacher ? [{ name: "Классы", href: "/classes" }] : []),
        { name: "Достижения", href: "/achievements" },
        { name: "Профиль", href: "/profile" },
    ];

    return (
        <nav className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-sm border-b border-neutral-200 h-16">
            <div className="max-w-6xl mx-auto px-6 h-full">
                <div className="flex justify-between items-center h-full">
                    {/* Logo */}
                    <div className="flex items-center">
                        <Link href="/" className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
                                U
                            </div>
                            <span className="font-bold tracking-tighter text-neutral-900 text-xl">
                                Uni-Prep
                            </span>
                        </Link>
                    </div>

                    {/* Nav Links */}
                    <div className="flex items-center gap-8">
                        <div className="hidden md:flex items-center gap-8">
                            {navLinks.map((link) => {
                                const isActive = pathname === link.href;
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className={`text-sm font-medium transition-colors ${isActive
                                            ? "text-neutral-900"
                                            : "text-neutral-500 hover:text-neutral-900"
                                            }`}
                                    >
                                        {link.name}
                                    </Link>
                                );
                            })}
                        </div>

                        <button
                            onClick={handleLogout}
                            className="text-sm font-medium text-neutral-500 hover:text-red-600 transition-colors ml-4"
                        >
                            Выйти
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
}
