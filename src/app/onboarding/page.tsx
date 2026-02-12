"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { createUserProfile } from "@/lib/auth-utils";
import { auth } from "@/lib/firebase";
import { UserRole } from "@/lib/firestore-schema";
import { SUBJECTS } from "@/lib/constants";
import { Check } from "lucide-react";

export default function OnboardingPage() {
    const [step, setStep] = useState(0); // 0: Role, 1: Profile, 2: Subjects
    const [role, setRole] = useState<UserRole | null>(null);
    const [name, setName] = useState("");
    const [surname, setSurname] = useState("");
    const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();
    const { setUser } = useAuthStore();

    const handleNext = () => {
        if (step === 0 && role) setStep(1);
        else if (step === 1 && name.length >= 2) {
            if (role === "teacher") setStep(2);
            else handleFinish();
        }
        else if (step === 2) handleFinish();
    };

    const handleFinish = async () => {
        if (!role || name.length < 2) return;
        if (role === "teacher" && selectedSubjects.length === 0 && step === 2) {
            alert("Пожалуйста, выберите хотя бы один предмет.");
            return;
        }

        try {
            setIsSubmitting(true);
            const updatedProfile = await createUserProfile(
                auth.currentUser!,
                role,
                role === "teacher" ? selectedSubjects : [],
                name,
                surname
            );
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

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white p-4 py-24">
            <div className="w-full max-w-sm">
                <div className="text-center mb-12 flex flex-col items-center gap-2">
                    <div className="w-10 h-10 bg-neutral-900 rounded-lg flex items-center justify-center text-white font-bold text-2xl">
                        L
                    </div>
                </div>

                {/* Step 0: Role Selection */}
                {step === 0 && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="text-center mb-12">
                            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Кто вы?</h1>
                            <p className="text-neutral-500 mt-2">Выберите вашу роль в системе.</p>
                        </div>
                        <div className="grid grid-cols-1 gap-4 mb-12">
                            <button
                                onClick={() => setRole("student")}
                                className={`p-6 rounded-xl border-2 transition-all flex items-center gap-4 text-left ${role === "student" ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:border-neutral-400 bg-white"}`}
                            >
                                <span className="text-4xl text-neutral-900">🎓</span>
                                <div>
                                    <span className="block font-semibold text-neutral-900">Ученик</span>
                                    <span className="text-xs text-neutral-500">Хочу учиться и достигать новых высот.</span>
                                </div>
                            </button>
                            <button
                                onClick={() => setRole("teacher")}
                                className={`p-6 rounded-xl border-2 transition-all flex items-center gap-4 text-left ${role === "teacher" ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:border-neutral-400 bg-white"}`}
                            >
                                <span className="text-4xl text-neutral-900">👨‍🏫</span>
                                <div>
                                    <span className="block font-semibold text-neutral-900">Учитель</span>
                                    <span className="text-xs text-neutral-500">Хочу делиться знаниями и управлять классами.</span>
                                </div>
                            </button>
                        </div>
                        <button
                            onClick={handleNext}
                            disabled={!role}
                            className="w-full py-4 bg-neutral-900 text-white rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-30"
                        >
                            Продолжить
                        </button>
                    </div>
                )}

                {/* Step 1: Profile Details */}
                {step === 1 && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="text-center mb-12">
                            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Заполни свой профиль.</h1>
                            <p className="text-neutral-500 mt-2">Это поможет вашим коллегам узнать вас.</p>
                        </div>
                        <div className="space-y-4 mb-12">
                            <div>
                                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Имя</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Введите ваше имя"
                                    className="w-full p-4 bg-white border border-neutral-200 rounded-xl focus:border-neutral-900 focus:outline-none transition-colors"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Фамилия (необязательно)</label>
                                <input
                                    type="text"
                                    value={surname}
                                    onChange={(e) => setSurname(e.target.value)}
                                    placeholder="Введите фамилию"
                                    className="w-full p-4 bg-white border border-neutral-200 rounded-xl focus:border-neutral-900 focus:outline-none transition-colors"
                                />
                            </div>
                        </div>
                        <button
                            onClick={handleNext}
                            disabled={!isNameValid || isSubmitting}
                            className="w-full py-4 bg-neutral-900 text-white rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-30"
                        >
                            {isSubmitting ? "Сохранение..." : "Продолжить"}
                        </button>
                    </div>
                )}

                {/* Step 2: Subjects (Teachers only) */}
                {step === 2 && role === "teacher" && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="text-center mb-12">
                            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Что вы преподаете?</h1>
                            <p className="text-neutral-500 mt-2">Выберите предметы для управления вашими новыми классами.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-12">
                            {SUBJECTS.map((subject) => (
                                <button
                                    key={subject.id}
                                    onClick={() => toggleSubject(subject.id)}
                                    className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all gap-2 text-center ${selectedSubjects.includes(subject.id) ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:border-neutral-400 bg-white"}`}
                                >
                                    <span className="text-2xl">{subject.emoji}</span>
                                    <span className="text-xs font-bold text-neutral-900 uppercase tracking-tight">{subject.name}</span>
                                    {selectedSubjects.includes(subject.id) && (
                                        <div className="absolute top-2 right-2">
                                            <Check size={14} className="text-neutral-900" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={handleFinish}
                            disabled={selectedSubjects.length === 0 || isSubmitting}
                            className="w-full py-4 bg-neutral-900 text-white rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-30"
                        >
                            {isSubmitting ? "Завершение..." : "Начать работу"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
