"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Copy } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { createUserProfile } from "@/lib/auth-utils";
import supabase from "@/lib/supabase/client";
import { APP_NAME, REGISTERED_VIA_KEY } from "@/lib/app-config";
import RegistanLogo from "@/components/registan-logo";
import { isValidUzPhone, formatPhoneDisplay, normalizePhone } from "@/lib/phone-utils";
import type { RegisteredVia } from "@/lib/firestore-schema";

export default function OnboardingPage() {
    const [name, setName] = useState("");
    const [surname, setSurname] = useState("");
    const [phone, setPhone] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [studentId, setStudentId] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const router = useRouter();
    const { user, isLoading, setUser } = useAuthStore();

    // AuthProvider (mounted once, globally) is the single source of truth
    // for "did this browser just complete a real Google sign-in" — it
    // already retries transient profile-fetch failures (see
    // auth-provider.tsx). This page used to make its own second,
    // un-retried supabase.auth.getUser() call as an extra guard, which
    // could fail on a brief hiccup moments after a brand-new session was
    // created and send a legitimate new signup straight back to a bare
    // /login with no retry at all — reproduced live: QR/join registrations
    // intermittently looped back to /login right after Google sign-in
    // completed. Trusting the already-robust global auth state instead of
    // re-deriving it here removes that race.
    useEffect(() => {
        if (!isLoading && !user) {
            router.replace("/login");
        }
    }, [isLoading, user, router]);

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
            setStudentId(updatedProfile.shortId);
        } catch (err) {
            console.error("Error saving profile:", err);
            setError("Ошибка при сохранении профиля.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const copyStudentId = () => {
        if (!studentId) return;
        navigator.clipboard.writeText(studentId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const isNameValid = name.length >= 2 && /^[a-zA-Zа-яА-ЯёЁ\s-]+$/.test(name);
    const isPhoneValid = isValidUzPhone(phone);

    const primaryBtnClass =
        "w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35";

    return (
        <div className="relative flex min-h-dvh flex-col bg-background text-foreground">
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
                <div className="w-full max-w-md">
                    <div className="mb-8 flex justify-center">
                        <div className="flex items-center gap-3">
                            <RegistanLogo className="h-14 w-14 sm:h-16 sm:w-16" />
                            <span className="text-2xl font-extrabold tracking-tight text-foreground sm:text-[1.75rem]">
                                {APP_NAME}
                            </span>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-md">
                        {studentId ? (
                            <div className="px-6 py-8 text-center sm:px-8 sm:py-9">
                                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                                    Готово!
                                </h1>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Это ваш ID ученика — сохраните его, он понадобится учителю
                                </p>
                                <button
                                    type="button"
                                    onClick={copyStudentId}
                                    className="mx-auto mt-6 flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-6 py-4 font-mono text-xl font-bold tracking-widest text-foreground transition-colors hover:bg-muted"
                                >
                                    {studentId}
                                    {copied ? (
                                        <Check className="h-5 w-5 text-emerald-600" strokeWidth={2.5} />
                                    ) : (
                                        <Copy className="h-5 w-5 text-muted-foreground" strokeWidth={2} />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => router.push("/")}
                                    className={`${primaryBtnClass} mt-8`}
                                >
                                    <span>Продолжить</span>
                                    <ArrowRight className="h-4 w-4" strokeWidth={2} />
                                </button>
                            </div>
                        ) : (
                            <div className="px-6 py-8 sm:px-8 sm:py-9">
                                <div className="mb-8 text-center">
                                    <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                                        Ваш профиль
                                    </h1>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Администратор увидит вас в панели и назначит тест
                                    </p>
                                </div>
                                <div className="mb-8 space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="ml-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Имя
                                        </label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Ваше имя"
                                            className="w-full rounded-xl border border-border bg-card p-4 text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="ml-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Фамилия
                                        </label>
                                        <input
                                            type="text"
                                            value={surname}
                                            onChange={(e) => setSurname(e.target.value)}
                                            placeholder="По желанию"
                                            className="w-full rounded-xl border border-border bg-card p-4 text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="ml-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Номер телефона
                                        </label>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="+998 90 123 45 67"
                                            className="w-full rounded-xl border border-border bg-card p-4 text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                                        />
                                        {phone && isPhoneValid ? (
                                            <p className="ml-0.5 text-xs text-muted-foreground">
                                                {formatPhoneDisplay(normalizePhone(phone))}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>

                                {error ? (
                                    <div className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
