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
        <nav className="sticky top-4 z-50 w-full px-4">
            <div className="max-w-3xl mx-auto rounded-[999px] h-20 bg-white/5 border border-white/15 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
                <div className="flex items-center justify-between h-full px-4">
                    {/* Logo Area */}
                    <div className="flex items-center ml-[16px]">
                        <Link href="/" className="flex items-center">
                            <div className="relative w-60 h-16">
                                <Image
                                    src="/лого.png"
                                    alt="Uni-Prep Logo"
                                    fill
                                    className="object-contain object-left opacity-95"
                                />
                            </div>
                        </Link>
                    </div>

                    {/* Nav Links - Centered */}
                    <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-6">
                        {navLinks.map((link) => {
                            const isActive = pathname === link.href;
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="relative text-[15px] font-semibold text-white/80 hover:text-white transition-colors group py-2"
                                >
                                    {link.name}
                                    <span
                                        className={`absolute -bottom-1 left-0 h-[2px] rounded-full bg-white transition-all duration-300 ease-out ${
                                            isActive
                                                ? "w-full opacity-100"
                                                : "w-0 opacity-0 group-hover:w-full group-hover:opacity-100"
                                        }`}
                                    />
                                </Link>
                            );
                        })}
                    </div>

                    {/* Right Action Area */}
                    <div className="flex items-center gap-2">
                        {/* Notification Icon */}
                        <button className="p-2 text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/10">
                            <Bell size={20} />
                        </button>

                        {/* Profile/Logout Area */}
                        <div className="flex items-center gap-2 pl-2 h-10 border-l border-white/10">
                            <Link
                                href="/profile"
                                className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/20 text-white/80 hover:bg-white/10 transition-colors"
                            >
                                <User size={18} />
                            </Link>

                            <button
                                onClick={handleLogout}
                                className="px-3.5 py-2 bg-white/10 text-white rounded-xl text-[13px] font-semibold hover:bg-white/20 transition-colors border border-white/20 shadow-[0_0_20px_rgba(0,0,0,0.4)]"
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
