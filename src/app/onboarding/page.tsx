"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, ArrowRight, User, GraduationCap } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { createUserProfile } from "@/lib/auth-utils";
import supabase from "@/lib/supabase/client";
import { UserRole } from "@/lib/firestore-schema";
import { SUBJECTS } from "@/lib/constants";

const THEME_KEY = "uni-prep-theme";

export default function OnboardingPage() {
    const [step, setStep] = useState(0);
    const [role, setRole] = useState<UserRole | null>(null);
    const [name, setName] = useState("");
    const [surname, setSurname] = useState("");
    const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
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
                        const fromUrl = await supabase.auth.getSessionFromUrl({ storeSession: true });
                        if (fromUrl?.data?.session) {
                            // Refresh user after storing session
                            const refreshed = await supabase.auth.getUser();
                            data = refreshed.data;
                            error = refreshed.error;
                        }
                    } catch (e) {
                        // ignore — we'll redirect below if no session
                    }
                }

                if (error || !data?.user) {
                    if (!mounted) return;
                    router.replace("/login");
                    return;
                }

                const user = data.user as any;
                const identities = user?.identities || [];
                const signedWithGoogle = identities.some((id: any) => id.provider === "google");

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
                const saved = localStorage.getItem(THEME_KEY);
                if (saved === "dark") root.classList.add("dark");
                else root.classList.remove("dark");
            } catch {
                /* ignore */
            }
        };
    }, []);

    const handleNext = () => {
        if (step === 0 && role) setStep(1);
        else if (step === 1 && name.length >= 2) {
            if (role === "teacher") setStep(2);
            else void handleFinish();
        } else if (step === 2) void handleFinish();
    };

    const handleFinish = async () => {
        if (!role || name.length < 2) return;
        if (role === "teacher" && selectedSubjects.length === 0 && step === 2) {
            alert("Пожалуйста, выберите хотя бы один предмет.");
            return;
        }

        try {
            setIsSubmitting(true);
            const { data: userData, error: getUserError } = await supabase.auth.getUser();
            if (getUserError || !userData?.user) {
                throw new Error("Supabase user not found");
            }
            const supabaseUser = userData.user;
            const updatedProfile = await createUserProfile(supabaseUser, {
                role,
                subjects: role === "teacher" ? selectedSubjects : [],
                name,
                surname,
            });
            setUser(updatedProfile);
            router.push("/");
        } catch (error) {
            console.error("Error saving profile:", error);
            alert("Ошибка при сохранении профиля.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleSubject = (id: string) => {
        setSelectedSubjects((prev) =>
            prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
        );
    };

    const isNameValid = name.length >= 2 && /^[a-zA-Zа-яА-ЯёЁ\s-]+$/.test(name);

    const steps = [0, 1, ...(role === "teacher" ? [2] : [])];

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
                                UniPrep
                            </span>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-3xl border border-neutral-200/90 bg-white shadow-md">
                        <div className="px-6 py-8 sm:px-8 sm:py-9">
                            <div className="mb-8 flex justify-center gap-2">
                                {steps.map((s) => (
                                    <div
                                        key={s}
                                        className={`h-1.5 rounded-full transition-all duration-300 ${
                                            step === s ? "w-8 bg-neutral-900" : "w-2 bg-neutral-200"
                                        }`}
                                    />
                                ))}
                            </div>

                            {step === 0 && (
                                <div>
                                    <div className="mb-8 text-center">
                                        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
                                            Кто вы?
                                        </h1>
                                        <p className="mt-2 text-sm text-neutral-500">
                                            Выберите роль в системе
                                        </p>
                                    </div>
                                    <div className="mb-8 grid grid-cols-1 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setRole("student")}
                                            className={`flex items-center gap-4 rounded-2xl border-2 p-5 text-left transition-all duration-200 ${
                                                role === "student"
                                                    ? "border-neutral-900 bg-neutral-50 shadow-sm"
                                                    : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/80"
                                            }`}
                                        >
                                            <div
                                                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${
                                                    role === "student"
                                                        ? "border-neutral-200 bg-neutral-100 text-neutral-800"
                                                        : "border-neutral-200 bg-neutral-100 text-neutral-500"
                                                }`}
                                            >
                                                <GraduationCap className="h-6 w-6" strokeWidth={1.75} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <span className="block text-base font-bold text-neutral-900">
                                                    Ученик
                                                </span>
                                                <span className="mt-0.5 block text-xs text-neutral-500">
                                                    Учусь и прохожу материалы и тесты
                                                </span>
                                            </div>
                                            {role === "student" ? (
                                                <Check className="h-5 w-5 shrink-0 text-neutral-900" strokeWidth={2} />
                                            ) : null}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setRole("teacher")}
                                            className={`flex items-center gap-4 rounded-2xl border-2 p-5 text-left transition-all duration-200 ${
                                                role === "teacher"
                                                    ? "border-neutral-900 bg-neutral-50 shadow-sm"
                                                    : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/80"
                                            }`}
                                        >
                                            <div
                                                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${
                                                    role === "teacher"
                                                        ? "border-neutral-200 bg-neutral-100 text-neutral-800"
                                                        : "border-neutral-200 bg-neutral-100 text-neutral-500"
                                                }`}
                                            >
                                                <User className="h-6 w-6" strokeWidth={1.75} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <span className="block text-base font-bold text-neutral-900">
                                                    Учитель
                                                </span>
                                                <span className="mt-0.5 block text-xs text-neutral-500">
                                                    Веду занятия и выбираю предметы
                                                </span>
                                            </div>
                                            {role === "teacher" ? (
                                                <Check className="h-5 w-5 shrink-0 text-neutral-900" strokeWidth={2} />
                                            ) : null}
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleNext}
                                        disabled={!role}
                                        className={primaryBtnClass}
                                    >
                                        <span>Продолжить</span>
                                        <ArrowRight className="h-4 w-4" strokeWidth={2} />
                                    </button>
                                </div>
                            )}

                            {step === 1 && (
                                <div>
                                    <div className="mb-8 text-center">
                                        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
                                            Ваш профиль
                                        </h1>
                                        <p className="mt-2 text-sm text-neutral-500">
                                            Так вас будут видеть в системе
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
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleNext}
                                        disabled={!isNameValid || isSubmitting}
                                        className={primaryBtnClass}
                                    >
                                        <span>{isSubmitting ? "Сохранение…" : "Продолжить"}</span>
                                        {!isSubmitting ? (
                                            <ArrowRight className="h-4 w-4" strokeWidth={2} />
                                        ) : null}
                                    </button>
                                </div>
                            )}

                            {step === 2 && role === "teacher" && (
                                <div>
                                    <div className="mb-8 text-center">
                                        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
                                            Предметы
                                        </h1>
                                        <p className="mt-2 text-sm text-neutral-500">
                                            Выберите предметы, которые преподаёте
                                        </p>
                                    </div>
                                    <div className="mb-8 grid max-h-[min(300px,45vh)] grid-cols-2 gap-3 overflow-y-auto pr-1">
                                        {SUBJECTS.map((subject) => {
                                            const on = selectedSubjects.includes(subject.id);
                                            return (
                                                <button
                                                    key={subject.id}
                                                    type="button"
                                                    onClick={() => toggleSubject(subject.id)}
                                                    className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-4 text-center transition-all duration-200 ${
                                                        on
                                                            ? "border-neutral-900 bg-neutral-50 shadow-sm"
                                                            : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/80"
                                                    }`}
                                                >
                                                    <span className="text-2xl leading-none" aria-hidden>
                                                        {subject.emoji}
                                                    </span>
                                                    <span className="text-[10px] font-bold uppercase leading-tight tracking-wide text-neutral-700">
                                                        {subject.name}
                                                    </span>
                                                    {on ? (
                                                        <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900">
                                                            <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
                                                        </div>
                                                    ) : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void handleFinish()}
                                        disabled={selectedSubjects.length === 0 || isSubmitting}
                                        className={primaryBtnClass}
                                    >
                                        <span>{isSubmitting ? "Завершение…" : "Начать работу"}</span>
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
        </div>
    );
}
