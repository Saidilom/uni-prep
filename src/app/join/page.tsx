"use client";

import { useEffect, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { APP_THEME_KEY, REGISTERED_VIA_KEY } from "@/lib/app-config";
import { signInWithGoogle } from "@/lib/auth-utils";
import { useAuthStore } from "@/store/useAuthStore";
import type { RegisteredVia } from "@/lib/firestore-schema";
import AuthShell from "@/components/auth-shell";

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
        <AuthShell>
            <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Добро пожаловать
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-neutral-500">
                    Регистрация для вступительного тестирования в учебном центре Registan.
                </p>
            </div>

            {error ? (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            ) : null}

            <button type="button" onClick={() => void handleLogin()} disabled={isLoading} className={primaryBtn}>
                <Image src="/google.png" alt="" width={22} height={22} className="shrink-0" />
                {isLoading ? "Подключение…" : "Зарегистрироваться через Google"}
            </button>

            <p className="mt-6 text-center text-sm text-neutral-500">
                Уже есть аккаунт?{" "}
                <Link href="/login" className="font-semibold text-neutral-900 hover:underline">
                    Войти
                </Link>
            </p>
        </AuthShell>
    );
}

export default function JoinPage() {
    return (
        <Suspense fallback={<div className="flex min-h-dvh items-center justify-center">Загрузка…</div>}>
            <JoinPageContent />
        </Suspense>
    );
}
