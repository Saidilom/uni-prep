"use client";

import { useEffect, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { REGISTERED_VIA_KEY } from "@/lib/app-config";
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
        if (user?.phone) router.push("/");
    }, [user, router]);

    const primaryBtn =
        "flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card py-4 pl-5 pr-6 text-sm font-semibold text-foreground shadow-sm transition-all duration-200 hover:bg-muted active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

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
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    Добро пожаловать
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Регистрация для вступительного тестирования в учебном центре Registan.
                </p>
            </div>

            {error ? (
                <div className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            ) : null}

            <button type="button" onClick={() => void handleLogin()} disabled={isLoading} className={primaryBtn}>
                <Image src="/google.png" alt="" width={22} height={22} className="shrink-0" />
                {isLoading ? "Подключение…" : "Зарегистрироваться через Google"}
            </button>

            <p className="mt-6 text-center text-sm text-muted-foreground">
                Уже есть аккаунт?{" "}
                <Link href="/login" className="font-semibold text-foreground hover:underline">
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
