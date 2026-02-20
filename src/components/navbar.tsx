"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { logOut } from "@/lib/auth-utils";
import { Bell, User, X, Menu, LogOut } from "lucide-react";

export default function Navbar() {
    const { user } = useAuthStore();
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);
    const overlayRef = useRef<HTMLDivElement>(null);

    if (!user) return null;

    const isTeacher = user.role === "teacher";

    const navLinks = [
        { name: "Главная", href: "/" },
        ...(isTeacher ? [{ name: "Классы", href: "/classes" }] : []),
        { name: "Достижения", href: "/achievements" },
        { name: "Профиль", href: "/profile" },
    ];

    const handleLogout = async () => {
        if (confirm("Вы уверены, что хотите выйти?")) {
            await logOut();
        }
    };

    const closeMenu = () => setMobileOpen(false);

    return (
        <>
            <nav className="sticky top-4 z-[100] w-full px-4">
                <div className="max-w-5xl mx-auto rounded-[2rem] lg:rounded-[999px] h-16 lg:h-20 bg-black/40 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl transition-all duration-300">
                    <div className="flex items-center justify-between h-full px-4 lg:px-8">
                        {/* Logo */}
                        <div className="flex items-center">
                            <Link href="/" className="flex items-center">
                                <div className="relative w-32 lg:w-48 h-10 lg:h-14">
                                    <Image
                                        src="/лого.png"
                                        alt="Uni-Prep Logo"
                                        fill
                                        className="object-contain object-left"
                                        priority
                                    />
                                </div>
                            </Link>
                        </div>

                        {/* Desktop Navigation */}
                        <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-10">
                            {navLinks.map((link) => {
                                const isActive = pathname === link.href;
                                if (link.name === "Профиль") return null;
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className="relative text-[13px] font-bold text-white/60 hover:text-white transition-all group py-2 tracking-[0.1em] uppercase"
                                    >
                                        {link.name}
                                        <span
                                            className={`absolute -bottom-1 left-0 h-[2.5px] rounded-full bg-white transition-all duration-300 ease-out ${isActive
                                                ? "w-full opacity-100 shadow-[0_0_15px_rgba(255,255,255,0.6)]"
                                                : "w-0 opacity-0 group-hover:w-full group-hover:opacity-100"
                                                }`}
                                        />
                                    </Link>
                                );
                            })}
                        </div>

                        {/* Right Actions */}
                        <div className="flex items-center gap-2 lg:gap-4">
                            <button className="hidden sm:flex p-2.5 text-white/50 hover:text-white transition-colors rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10">
                                <Bell size={20} />
                            </button>

                            <div className="hidden sm:flex items-center gap-3 pl-3 h-10 border-l border-white/10">
                                <Link
                                    href="/profile"
                                    className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all"
                                >
                                    <User size={18} />
                                </Link>
                                <button
                                    onClick={handleLogout}
                                    className="px-5 py-2 bg-white text-black rounded-xl text-[13px] font-black hover:bg-neutral-200 transition-all active:scale-95 shadow-xl"
                                >
                                    Выйти
                                </button>
                            </div>

                            {/* Mobile burger button — stays inside the navbar bar */}
                            <button
                                className="lg:hidden flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                                onClick={() => setMobileOpen(true)}
                                aria-label="Открыть меню"
                            >
                                <Menu size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Mobile Menu Overlay */}
            {/* Backdrop */}
            <div
                className={`fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
                onClick={closeMenu}
            />

            {/* Slide-in Panel */}
            <div
                className={`fixed top-0 right-0 z-[210] h-full w-[min(85vw,360px)] bg-black/80 backdrop-blur-2xl border-l border-white/10 flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] lg:hidden ${mobileOpen ? "translate-x-0" : "translate-x-full"}`}
            >
                {/* Panel Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/5">
                    <Link href="/" onClick={closeMenu}>
                        <div className="relative w-28 h-8">
                            <Image
                                src="/лого.png"
                                alt="Uni-Prep Logo"
                                fill
                                className="object-contain object-left"
                                priority
                            />
                        </div>
                    </Link>
                    <button
                        onClick={closeMenu}
                        className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
                        aria-label="Закрыть меню"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Nav Links */}
                <nav className="flex-1 flex flex-col gap-1 px-4 py-6 overflow-y-auto">
                    {navLinks.map((link) => {
                        const isActive = pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={closeMenu}
                                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-[15px] font-semibold tracking-wide transition-all ${isActive
                                    ? "bg-white/10 text-white border border-white/15"
                                    : "text-white/50 hover:text-white hover:bg-white/5"
                                    }`}
                            >
                                {link.name}
                                {isActive && (
                                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Bottom Actions */}
                <div className="px-4 pb-8 pt-4 border-t border-white/5 flex flex-col gap-3">
                    <Link
                        href="/profile"
                        onClick={closeMenu}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-all text-[14px] font-medium"
                    >
                        <User size={17} />
                        Профиль
                    </Link>
                    <button
                        onClick={() => { closeMenu(); handleLogout(); }}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-red-400/70 hover:text-red-400 hover:bg-red-500/5 transition-all text-[14px] font-medium w-full"
                    >
                        <LogOut size={17} />
                        Выйти
                    </button>
                </div>
            </div>
        </>
    );
}
