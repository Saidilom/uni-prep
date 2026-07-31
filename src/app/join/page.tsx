"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Phone, ClipboardCheck, GraduationCap } from "lucide-react";
import { APP_NAME, APP_THEME_KEY } from "@/lib/app-config";
import { sendPhoneVerificationCode, verifyPhoneCode } from "@/lib/phone-auth";
import { isValidUzPhone, formatPhoneDisplay } from "@/lib/phone-utils";
import { createUserProfile } from "@/lib/auth-utils";
import supabase from "@/lib/supabase/client";
import { useAuthStore } from "@/store/useAuthStore";
import type { RegisteredVia } from "@/lib/firestore-schema";

const REGISTERED_VIA_KEY = "registan-registered-via";

type Step = "intro" | "phone" | "code" | "profile";

function JoinPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, setUser } = useAuthStore();

    const [step, setStep] = useState<Step>("intro");
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [name, setName] = useState("");
    const [surname, setSurname] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const source = searchParams.get("source");
    const registeredVia: RegisteredVia = source === "reception" ? "qr" : "phone";

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
        if (user?.role) {
            router.push("/");
        } else if (user && !user.role) {
            setStep("profile");
            if (user.phone) setPhone(user.phone);
            if (user.name) setName(user.name);
            if (user.surname) setSurname(user.surname || "");
        }
    }, [user, router]);

    const primaryBtn =
        "w-full flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-900 py-4 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-neutral-800 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";

    const handleSendCode = async () => {
        setError(null);
        if (!isValidUzPhone(phone)) {
            setError("Введите номер в формате +998 XX XXX XX XX");
            return;
        }
        try {
            setIsLoading(true);
            sessionStorage.setItem(REGISTERED_VIA_KEY, registeredVia);
            await sendPhoneVerificationCode(phone);
            setStep("code");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Не удалось отправить SMS");
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        setError(null);
        try {
            setIsLoading(true);
            await verifyPhoneCode(code);
            setStep("profile");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Неверный код");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateProfile = async () => {
        if (name.length < 2) {
            setError("Введите имя (минимум 2 символа)");
            return;
        }

        try {
            setIsLoading(true);
            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError || !userData?.user) {
                throw new Error("Сессия истекла. Начните заново.");
            }

            const via =
                (sessionStorage.getItem(REGISTERED_VIA_KEY) as RegisteredVia) ||
                registeredVia;
            const profile = await createUserProfile(userData.user, {
                role: "student",
                name,
                surname,
                phone,
                registeredVia: via,
            });
            sessionStorage.removeItem(REGISTERED_VIA_KEY);
            setUser(profile);
            router.push("/");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Ошибка сохранения профиля");
        } finally {
            setIsLoading(false);
        }
    };

    const isNameValid = name.length >= 2;

    return (
        <div className="relative flex min-h-dvh flex-col bg-white text-neutral-900">
            <div id="recaptcha-container" />

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
                            {step === "intro" && (
                                <>
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
                                            { icon: Phone, text: "Регистрация по номеру телефона" },
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
                                    <button type="button" onClick={() => setStep("phone")} className={primaryBtn}>
                                        <span>Начать регистрацию</span>
                                        <ArrowRight className="h-4 w-4" />
                                    </button>
                                    <p className="mt-6 text-center text-sm text-neutral-500">
                                        Уже есть аккаунт?{" "}
                                        <Link href="/login" className="font-semibold text-neutral-900 hover:underline">
                                            Войти
                                        </Link>
                                    </p>
                                </>
                            )}

                            {step === "phone" && (
                                <>
                                    <div className="mb-8 text-center">
                                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Ваш телефон</h1>
                                        <p className="mt-2 text-sm text-neutral-500">
                                            Отправим SMS с кодом подтверждения
                                        </p>
                                    </div>
                                    <div className="mb-6 space-y-1.5">
                                        <label className="ml-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                            Номер телефона
                                        </label>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="+998 90 123 45 67"
                                            className="w-full rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                                        />
                                    </div>
                                    {error ? (
                                        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                            {error}
                                        </div>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={() => void handleSendCode()}
                                        disabled={isLoading}
                                        className={primaryBtn}
                                    >
                                        {isLoading ? "Отправка…" : "Получить код"}
                                    </button>
                                </>
                            )}

                            {step === "code" && (
                                <>
                                    <div className="mb-8 text-center">
                                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Код из SMS</h1>
                                        <p className="mt-2 text-sm text-neutral-500">
                                            Отправлен на {formatPhoneDisplay(phone.startsWith("+") ? phone : `+998${phone}`)}
                                        </p>
                                    </div>
                                    <div className="mb-6 space-y-1.5">
                                        <label className="ml-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                            Код подтверждения
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={code}
                                            onChange={(e) => setCode(e.target.value)}
                                            placeholder="123456"
                                            className="w-full rounded-2xl border border-neutral-200 bg-white p-4 text-center text-lg tracking-widest text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                                        />
                                    </div>
                                    {error ? (
                                        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                            {error}
                                        </div>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={() => void handleVerifyCode()}
                                        disabled={isLoading}
                                        className={primaryBtn}
                                    >
                                        {isLoading ? "Проверка…" : "Подтвердить"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setStep("phone"); setError(null); }}
                                        className="mt-4 w-full text-sm font-medium text-neutral-500 hover:text-neutral-900"
                                    >
                                        Изменить номер
                                    </button>
                                </>
                            )}

                            {step === "profile" && (
                                <>
                                    <div className="mb-8 text-center">
                                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Ваш профиль</h1>
                                        <p className="mt-2 text-sm text-neutral-500">
                                            Администратор увидит вас в панели и назначит тест
                                        </p>
                                    </div>
                                    <div className="mb-6 space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="ml-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                                Имя *
                                            </label>
                                            <input
                                                type="text"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                placeholder="Имя"
                                                className="w-full rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
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
                                                placeholder="Фамилия"
                                                className="w-full rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                                            />
                                        </div>
                                        {phone ? (
                                            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                                                Телефон: {formatPhoneDisplay(phone.startsWith("+") ? phone : `+998${phone}`)}
                                            </div>
                                        ) : null}
                                    </div>
                                    {error ? (
                                        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                            {error}
                                        </div>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={() => void handleCreateProfile()}
                                        disabled={!isNameValid || isLoading}
                                        className={primaryBtn}
                                    >
                                        {isLoading ? "Сохранение…" : "Завершить регистрацию"}
                                    </button>
                                </>
                            )}
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
