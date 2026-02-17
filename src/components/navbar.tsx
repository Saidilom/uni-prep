"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { logOut } from "@/lib/auth-utils";
import { Bell, Sparkles, User, LogOut } from "lucide-react";

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
    ];

    return (
        <nav className="sticky top-0 z-50 w-full bg-white border-b border-neutral-100 h-20">
            <div className="max-w-7xl mx-auto px-6 h-full">
                <div className="flex justify-between items-center h-full">
                    {/* Logo Area */}
                    <div className="flex items-center">
                        <Link href="/" className="flex items-center">
                            <div className="relative w-36 h-10">
                                <Image
                                    src="/logo.png"
                                    alt="Uni-Prep Logo"
                                    fill
                                    className="object-contain object-left"
                                />
                            </div>
                        </Link>
                    </div>

                    {/* Nav Links */}
                    <div className="hidden lg:flex items-center gap-10">
                        {navLinks.map((link) => {
                            const isActive = pathname === link.href;
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`text-[15px] font-semibold transition-colors ${isActive
                                        ? "text-neutral-900"
                                        : "text-neutral-500 hover:text-neutral-900"
                                        }`}
                                >
                                    {link.name}
                                </Link>
                            );
                        })}
                    </div>

                    {/* Right Action Area */}
                    <div className="flex items-center gap-5">
                        {/* Premium Button */}
                        <Link
                            href="/plus"
                            className="hidden sm:flex items-center gap-2 px-5 py-2.5 bg-[#22C55E] text-white rounded-full text-[14px] font-bold shadow-sm hover:shadow-md hover:bg-[#1eb054] transition-all"
                        >
                            <Sparkles size={16} fill="white" />
                            Uni-Prep Plus
                        </Link>

                        {/* Notification Icon */}
                        <button className="p-2 text-neutral-400 hover:text-neutral-600 transition-colors">
                            <Bell size={22} />
                        </button>

                        {/* Profile/Logout Area */}
                        <div className="flex items-center gap-3 pl-2 h-10 border-l border-neutral-100">
                            <Link
                                href="/profile"
                                className="w-10 h-10 rounded-full bg-neutral-50 flex items-center justify-center border border-neutral-200 text-neutral-500 hover:bg-neutral-100 transition-colors"
                            >
                                <User size={20} />
                            </Link>

                            <button
                                onClick={handleLogout}
                                className="px-5 py-2 bg-neutral-50 text-neutral-900 rounded-xl text-[14px] font-bold hover:bg-neutral-100 transition-colors border border-neutral-200"
                            >
                                Выйти
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}
