"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Library, ClipboardCheck, LineChart, type LucideIcon } from "lucide-react";
import { signInWithGoogle } from "@/lib/auth-utils";
import { useAuthStore } from "@/store/useAuthStore";
import supabase from "@/lib/supabase/client";
import { APP_NAME, APP_THEME_KEY } from "@/lib/app-config";

const features: { icon: LucideIcon; text: string }[] = [
    {
        icon: Library,
        text: "Материалы и тренировка по темам в карточках предметов",
    },
    {
        icon: ClipboardCheck,
        text: "Тесты с мгновенной обратной связью",
    },
    {
        icon: LineChart,
        text: "Графики прогресса и достижения на главной",
    },
];

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
        <div className="relative flex min-h-dvh flex-col bg-white text-neutral-900">
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
                <div className="w-full max-w-[420px]">
                    <div className="mb-8 flex justify-center">
                        <div className="flex items-center gap-3">
                            <div className="relative h-14 w-14 shrink-0 sm:h-16 sm:w-16">
                                <Image
                                    src="/gogg.png"
                                    alt=""
                                    fill
                                    className="object-contain"
                                    priority
                                />
                            </div>
                            <span className="text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-[1.75rem]">
                                {APP_NAME}
                            </span>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-3xl border border-neutral-200/90 bg-white shadow-md transition-shadow duration-300">
                        <div className="px-6 py-8 sm:px-8 sm:py-10">
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
                                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white py-4 pl-5 pr-6 text-sm font-semibold text-neutral-900 shadow-sm transition-all duration-200 hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                            >
                                <Image src="/google.png" alt="" width={22} height={22} className="shrink-0" />
                                {isLoading ? "Подключение…" : "Войти через Google"}
                            </button>

                            <ul className="mt-10 space-y-4">
                                {features.map(({ icon: Icon, text }) => (
                                    <li key={text} className="flex gap-3">
                                        <div
                                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 text-neutral-500"
                                            aria-hidden
                                        >
                                            <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.75} />
                                        </div>
                                        <span className="text-sm leading-snug text-neutral-500">{text}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
