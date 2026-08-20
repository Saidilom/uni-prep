"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { createUserProfile } from "@/lib/auth-utils";
import supabase from "@/lib/supabase/client";
import { APP_NAME, APP_THEME_KEY, REGISTERED_VIA_KEY } from "@/lib/app-config";
import { isValidUzPhone, formatPhoneDisplay, normalizePhone } from "@/lib/phone-utils";
import type { RegisteredVia } from "@/lib/firestore-schema";

export default function OnboardingPage() {
    const [name, setName] = useState("");
    const [surname, setSurname] = useState("");
    const [phone, setPhone] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();
    const { setUser } = useAuthStore();

    useEffect(() => {
        // Ensure only users who signed in with Google can access onboarding.
        // If there's no session or provider isn't Google, send to /login.
        let mounted = true;
        (async () => {
            try {
                let { data, error } = await supabase.auth.getUser();

                // If there's no user yet, try to parse an OAuth redirect URL
                // (supabase sets session from URL after provider redirect).
                if ((!data?.user || error) && typeof window !== "undefined") {
                    try {
                        const params = new URLSearchParams(window.location.hash.slice(1));
                        const accessToken = params.get("access_token");
                        const refreshToken = params.get("refresh_token");
                        if (accessToken && refreshToken) {
                            const { error: exchangeError } = await supabase.auth.setSession({
                                access_token: accessToken,
                                refresh_token: refreshToken,
                            });
                            if (!exchangeError) {
                                const refreshed = await supabase.auth.getUser();
                                data = refreshed.data;
                                error = refreshed.error;
                            }
                        }
                    } catch {
                        // ignore — we'll redirect below if no session
                    }
                }

                if (error || !data?.user) {
                    if (!mounted) return;
                    router.replace("/login");
                    return;
                }

                const user = data.user;
                const identities = user?.identities ?? [];
                const signedWithGoogle = identities.some((id) => id.provider === "google");

                if (!signedWithGoogle) {
                    if (!mounted) return;
                    router.replace("/login");
                }
            } catch (err) {
                console.error("Error checking onboarding access:", err);
                if (mounted) router.replace("/login");
            }
        })();
        return () => {
            mounted = false;
        };
    }, [router]);

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

    const handleFinish = async () => {
        setError(null);
        if (name.length < 2) {
            setError("Введите имя (минимум 2 символа)");
            return;
        }
        if (!isValidUzPhone(phone)) {
            setError("Введите номер в формате +998 XX XXX XX XX");
            return;
        }

        try {
            setIsSubmitting(true);
            const { data: userData, error: getUserError } = await supabase.auth.getUser();
            if (getUserError || !userData?.user) {
                throw new Error("Supabase user not found");
            }
            const supabaseUser = userData.user;
            const registeredVia =
                (sessionStorage.getItem(REGISTERED_VIA_KEY) as RegisteredVia) || "google";
            const updatedProfile = await createUserProfile(supabaseUser, {
                name,
                surname,
                phone: normalizePhone(phone),
                registeredVia,
            });
            sessionStorage.removeItem(REGISTERED_VIA_KEY);
            setUser(updatedProfile);
            router.push("/");
        } catch (err) {
            console.error("Error saving profile:", err);
            setError("Ошибка при сохранении профиля.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const isNameValid = name.length >= 2 && /^[a-zA-Zа-яА-ЯёЁ\s-]+$/.test(name);
    const isPhoneValid = isValidUzPhone(phone);

    const primaryBtnClass =
        "w-full flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-900 py-4 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-neutral-800 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35";

    return (
        <div className="relative flex min-h-dvh flex-col bg-white text-neutral-900">
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
                <div className="w-full max-w-md">
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

                    <div className="overflow-hidden rounded-3xl border border-neutral-200/90 bg-white shadow-md">
                        <div className="px-6 py-8 sm:px-8 sm:py-9">
                            <div className="mb-8 text-center">
                                <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
                                    Ваш профиль
                                </h1>
                                <p className="mt-2 text-sm text-neutral-500">
                                    Администратор увидит вас в панели и назначит тест
                                </p>
                            </div>
                            <div className="mb-8 space-y-4">
                                <div className="space-y-1.5">
                                    <label className="ml-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                        Имя
                                    </label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Ваше имя"
                                        className="w-full rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 placeholder:text-neutral-400 transition-colors focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="ml-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                        Фамилия
                                    </label>
                                    <input
                                        type="text"
                                        value={surname}
                                        onChange={(e) => setSurname(e.target.value)}
                                        placeholder="По желанию"
                                        className="w-full rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 placeholder:text-neutral-400 transition-colors focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="ml-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                        Номер телефона
                                    </label>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="+998 90 123 45 67"
                                        className="w-full rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 placeholder:text-neutral-400 transition-colors focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                                    />
                                    {phone && isPhoneValid ? (
                                        <p className="ml-0.5 text-xs text-neutral-500">
                                            {formatPhoneDisplay(normalizePhone(phone))}
                                        </p>
                                    ) : null}
                                </div>
                            </div>

                            {error ? (
                                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {error}
                                </div>
                            ) : null}

                            <button
                                type="button"
                                onClick={() => void handleFinish()}
                                disabled={!isNameValid || !isPhoneValid || isSubmitting}
                                className={primaryBtnClass}
                            >
                                <span>{isSubmitting ? "Сохранение…" : "Начать работу"}</span>
                                {!isSubmitting ? (
                                    <ArrowRight className="h-4 w-4" strokeWidth={2} />
                                ) : null}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
