"use client";

import { useEffect, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Phone, ClipboardCheck, GraduationCap } from "lucide-react";
import { APP_NAME, APP_THEME_KEY, REGISTERED_VIA_KEY } from "@/lib/app-config";
import { signInWithGoogle } from "@/lib/auth-utils";
import { useAuthStore } from "@/store/useAuthStore";
import type { RegisteredVia } from "@/lib/firestore-schema";

function JoinPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuthStore();

    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const source = searchParams.get("source");
    const registeredVia: RegisteredVia = source === "reception" ? "qr" : "google";

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
        if (user?.phone) router.push("/");
    }, [user, router]);

    const primaryBtn =
        "flex w-full items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white py-4 pl-5 pr-6 text-sm font-semibold text-neutral-900 shadow-sm transition-all duration-200 hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

    const handleLogin = async () => {
        setError(null);
        try {
            setIsLoading(true);
            sessionStorage.setItem(REGISTERED_VIA_KEY, registeredVia);
            await signInWithGoogle();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Ошибка при входе через Google");
            setIsLoading(false);
        }
    };

    return (
        <div className="relative flex min-h-dvh flex-col bg-white text-neutral-900">
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
                <div className="w-full max-w-[420px]">
                    <div className="mb-8 flex justify-center">
                        <div className="flex items-center gap-3">
                            <div className="relative h-14 w-14 shrink-0 sm:h-16 sm:w-16">
                                <Image src="/gogg.png" alt="" fill className="object-contain" priority />
                            </div>
                            <span className="text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-[1.75rem]">
                                {APP_NAME}
                            </span>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-3xl border border-neutral-200/90 bg-white shadow-md">
                        <div className="px-6 py-8 sm:px-8 sm:py-10">
                            <div className="mb-8 text-center">
                                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                    Добро пожаловать
                                </h1>
                                <p className="mt-3 text-sm leading-relaxed text-neutral-500">
                                    Регистрация для вступительного тестирования в учебном центре Registan.
                                </p>
                            </div>
                            <ul className="mb-8 space-y-4">
                                {[
                                    { icon: Phone, text: "Регистрация через Google" },
                                    { icon: ClipboardCheck, text: "Вступительный тест назначит администратор" },
                                    { icon: GraduationCap, text: "Подготовка к Национальному сертификату" },
                                ].map(({ icon: Icon, text }) => (
                                    <li key={text} className="flex gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 text-neutral-500">
                                            <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.75} />
                                        </div>
                                        <span className="text-sm leading-snug text-neutral-500">{text}</span>
                                    </li>
                                ))}
                            </ul>

                            {error ? (
                                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {error}
                                </div>
                            ) : null}

                            <button type="button" onClick={() => void handleLogin()} disabled={isLoading} className={primaryBtn}>
                                <Image src="/google.png" alt="" width={22} height={22} className="shrink-0" />
                                {isLoading ? "Подключение…" : "Войти через Google"}
                            </button>

                            <p className="mt-6 text-center text-sm text-neutral-500">
                                Уже есть аккаунт?{" "}
                                <Link href="/login" className="font-semibold text-neutral-900 hover:underline">
                                    Войти
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function JoinPage() {
    return (
        <Suspense fallback={<div className="flex min-h-dvh items-center justify-center">Загрузка…</div>}>
            <JoinPageContent />
        </Suspense>
    );
}
