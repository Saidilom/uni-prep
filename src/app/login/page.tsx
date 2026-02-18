"use client";

import { useState } from "react";
import { signInWithGoogle } from "@/lib/auth-utils";
import { useAuthStore } from "@/store/useAuthStore";
import Image from "next/image";

export default function LoginPage() {
    const [error, setError] = useState<string | null>(null);
    const { isLoading } = useAuthStore();

    const handleLogin = async () => {
        try {
            setError(null);
            await signInWithGoogle();
        } catch (err: any) {
            setError(err.message || "Ошибка при входе через Google");
        }
    };

    return (
        <div className="relative flex flex-col items-center justify-center min-h-screen bg-transparent overflow-hidden">

            <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-4">
                {/* Logo Section */}
                <div className="mb-10 flex flex-col items-center animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="relative w-72 h-32 transition-transform hover:scale-105 duration-300">
                        <Image
                            src="/logo.png"
                            alt="Uni-Prep Logo"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                </div>

                {/* Login Card */}
                <div className="w-full bg-white/70 backdrop-blur-xl p-8 rounded-[2rem] border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
                    <div className="text-center mb-8">
                        <h2 className="text-3xl font-semibold tracking-tight text-neutral-900">
                            С возвращением
                        </h2>
                        <p className="text-neutral-500 mt-2 text-sm">
                            Войдите через Google, чтобы продолжить обучение в системе Uni-Prep
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 rounded-2xl bg-red-50 text-red-600 text-xs border border-red-100 animate-in fade-in zoom-in duration-300">
                            {error}
                        </div>
                    )}

                    <button
                        onClick={handleLogin}
                        disabled={isLoading}
                        className="group relative w-full flex items-center justify-center gap-3 py-4 px-4 bg-neutral-900 text-white rounded-2xl font-semibold transition-all hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-50 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        <Image
                            src="/google.png"
                            alt="Google"
                            width={20}
                            height={20}
                            className="relative z-10"
                        />
                        <span className="relative z-10">Войти через Google</span>
                    </button>

                    <div className="mt-8 flex items-center gap-4">
                        <div className="h-px flex-1 bg-neutral-200" />
                        <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">Университетская подготовка</span>
                        <div className="h-px flex-1 bg-neutral-200" />
                    </div>

                    <p className="mt-8 text-center text-xs text-neutral-400 leading-relaxed italic">
                        Единственный путь к успеху — это постоянное обучение.
                    </p>
                </div>


            </div>
        </div>
    );
}
