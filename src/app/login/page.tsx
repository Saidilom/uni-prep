"use client";

import { useState } from "react";
import { signInWithGoogle } from "@/lib/auth-utils";
import { useAuthStore } from "@/store/useAuthStore";
import { Chrome } from "lucide-react";

export default function LoginPage() {
    const [error, setError] = useState<string | null>(null);
    const { isLoading } = useAuthStore();

    const handleLogin = async () => {
        try {
            setError(null);
            await signInWithGoogle();
            // Перенаправление произойдет автоматически через AuthProvider
        } catch (err: any) {
            setError(err.message || "Ошибка при входе через Google");
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white p-4">
            {/* Логотип / Название */}
            <div className="mb-12 flex flex-col items-center gap-2">
                <div className="w-10 h-10 bg-neutral-900 rounded-lg flex items-center justify-center text-white font-bold text-2xl">
                    L
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
                    LessonApp.
                </h1>
            </div>

            {/* Карточка входа */}
            <div className="w-full max-w-sm bg-white p-8 rounded-xl border border-neutral-200 shadow-sm">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-semibold tracking-tight text-neutral-900">
                        С возвращением
                    </h2>
                    <p className="text-sm text-neutral-500 mt-2">
                        Войдите через Google, чтобы продолжить обучение.
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100 italic">
                        {error}
                    </div>
                )}

                <button
                    onClick={handleLogin}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-neutral-900 text-white rounded-lg font-medium transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                >
                    <Chrome size={20} />
                    <span>Войти через Google</span>
                </button>

                <p className="mt-8 text-center text-xs text-neutral-400">
                    Это просто работает. Понятно и эффективно.
                </p>
            </div>

            {/* Footer Text */}
            <div className="mt-12 text-neutral-400 text-sm">
                © {new Date().getFullYear()} LessonApp Engineering
            </div>
        </div>
    );
}
