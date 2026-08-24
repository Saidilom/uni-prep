"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithGoogle } from "@/lib/auth-utils";
import { useAuthStore } from "@/store/useAuthStore";
import supabase from "@/lib/supabase/client";
import { APP_THEME_KEY } from "@/lib/app-config";
import AuthShell from "@/components/auth-shell";

export default function LoginPage() {
    const [error, setError] = useState<string | null>(null);
    const { isLoading } = useAuthStore();
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove("dark");
        return () => {
            try {
                const saved = localStorage.getItem(APP_THEME_KEY);
                if (saved === "dark") root.classList.add("dark");
                else root.classList.remove("dark");
            } catch {
                /* ignore */
            }
        };
    }, []);

    useEffect(() => {
        const redirectTarget = searchParams.get("redirectTo");
        const target = redirectTarget ? decodeURIComponent(redirectTarget) : "/";

        const goToTarget = () => {
            if (target && target !== "/login") {
                router.replace(target);
            } else {
                router.replace("/");
            }
        };

        let active = true;
        const initialize = async () => {
            const { data } = await supabase.auth.getSession();
            if (!active) return;
            if (data.session) {
                goToTarget();
            }
        };

        void initialize();

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!active) return;
            if (session?.user) {
                goToTarget();
            }
        });

        return () => {
            active = false;
            authListener.subscription.unsubscribe();
        };
    }, [router, searchParams]);

    const handleLogin = async () => {
        try {
            setError(null);
            await signInWithGoogle();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Ошибка при входе через Google";
            setError(errorMessage);
        }
    };

    return (
        <AuthShell>
            <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
                    С возвращением
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-neutral-500 sm:text-base">
                    Войдите через Google, чтобы продолжить занятия и смотреть прогресс на главной.
                </p>
            </div>

            {error ? (
                <div
                    role="alert"
                    className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                    {error}
                </div>
            ) : null}

            <button
                type="button"
                onClick={handleLogin}
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white py-4 pl-5 pr-6 text-sm font-semibold text-neutral-900 shadow-sm transition-all duration-200 hover:border-neutral-300 hover:bg-neutral-50 hover:shadow-md active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            >
                <Image src="/google.png" alt="" width={22} height={22} className="shrink-0" />
                {isLoading ? "Подключение…" : "Войти через Google"}
            </button>

            <p className="mt-6 text-center text-sm text-neutral-500">
                Ещё нет аккаунта?{" "}
                <Link href="/join" className="font-semibold text-neutral-900 hover:underline">
                    Зарегистрироваться
                </Link>
            </p>
        </AuthShell>
    );
}
