"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithGoogle } from "@/lib/auth-utils";
import { useAuthStore } from "@/store/useAuthStore";
import supabase from "@/lib/supabase/client";
import AuthShell from "@/components/auth-shell";
import { useTranslations } from "@/lib/i18n/locale-provider";

export default function LoginPage() {
    const [error, setError] = useState<string | null>(null);
    const { isLoading } = useAuthStore();
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations("auth");

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
            const errorMessage = err instanceof Error ? err.message : t("googleLoginError");
            setError(errorMessage);
        }
    };

    return (
        <AuthShell>
            <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {t("loginTitle")}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t("loginSubtitle")}
                </p>
            </div>

            {error ? (
                <div
                    role="alert"
                    className="mb-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                    {error}
                </div>
            ) : null}

            <button
                type="button"
                onClick={handleLogin}
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card py-4 pl-5 pr-6 text-sm font-semibold text-foreground shadow-sm transition-all duration-200 hover:bg-muted active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            >
                <Image src="/google.png" alt="" width={22} height={22} className="shrink-0" />
                {isLoading ? t("connecting") : t("loginWithGoogle")}
            </button>

            <p className="mt-6 text-center text-sm text-muted-foreground">
                {t("noAccountYet")}{" "}
                <Link href="/join" className="font-semibold text-foreground hover:underline">
                    {t("register")}
                </Link>
            </p>
        </AuthShell>
    );
}
