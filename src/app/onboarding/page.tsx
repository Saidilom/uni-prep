"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { createUserProfile } from "@/lib/auth-utils";
import { auth } from "@/lib/firebase";
import { UserRole } from "@/lib/firestore-schema";
import { SUBJECTS } from "@/lib/constants";
import { Check, ArrowRight, User, GraduationCap } from "lucide-react";
import Image from "next/image";

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
        <div className="relative flex flex-col items-center justify-center min-h-screen bg-[#F8FAFC] p-4 py-24 overflow-hidden">
            {/* Background Decorative Elements */}
            <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100 rounded-full blur-[120px] opacity-50" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-100 rounded-full blur-[120px] opacity-50" />

            <div className="relative z-10 w-full max-w-md">
                <div className="text-center mb-10 flex flex-col items-center animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="relative w-64 h-24 transition-transform hover:scale-105 duration-300">
                        <Image
                            src="/logo.png"
                            alt="Uni-Prep Logo"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                </div>

                <div className="bg-white/70 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    {/* Step Progress */}
                    <div className="flex justify-center gap-2 mb-8">
                        {[0, 1, ...(role === "teacher" ? [2] : [])].map((s) => (
                            <div
                                key={s}
                                className={`h-1.5 rounded-full transition-all duration-500 ${step === s ? "w-8 bg-neutral-900" : "w-2 bg-neutral-200"}`}
                            />
                        ))}
                    </div>

                    {/* Step 0: Role Selection */}
                    {step === 0 && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="text-center mb-10">
                                <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Кто вы?</h1>
                                <p className="text-neutral-500 mt-2">Выберите вашу роль в системе Uni-Prep.</p>
                            </div>
                            <div className="grid grid-cols-1 gap-4 mb-10">
                                <button
                                    onClick={() => setRole("student")}
                                    className={`group relative p-6 rounded-2xl border-2 transition-all flex items-center gap-5 text-left ${role === "student" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-100 hover:border-neutral-200 bg-white text-neutral-900"}`}
                                >
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${role === "student" ? "bg-white/20" : "bg-neutral-100"}`}>
                                        <GraduationCap size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <span className="block font-bold text-lg">Ученик</span>
                                        <span className={`text-xs ${role === "student" ? "text-neutral-300" : "text-neutral-500"}`}>Хочу учиться и достигать новых высот.</span>
                                    </div>
                                    {role === "student" && <Check size={20} className="text-white" />}
                                </button>

                                <button
                                    onClick={() => setRole("teacher")}
                                    className={`group relative p-6 rounded-2xl border-2 transition-all flex items-center gap-5 text-left ${role === "teacher" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-100 hover:border-neutral-200 bg-white text-neutral-900"}`}
                                >
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${role === "teacher" ? "bg-white/20" : "bg-neutral-100"}`}>
                                        <User size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <span className="block font-bold text-lg">Учитель</span>
                                        <span className={`text-xs ${role === "teacher" ? "text-neutral-300" : "text-neutral-500"}`}>Хочу делиться знаниями и управлять классами.</span>
                                    </div>
                                    {role === "teacher" && <Check size={20} className="text-white" />}
                                </button>
                            </div>
                            <button
                                onClick={handleNext}
                                disabled={!role}
                                className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-bold transition-all hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
                            >
                                <span>Продолжить</span>
                                <ArrowRight size={18} />
                            </button>
                        </div>
                    )}

                    {/* Step 1: Profile Details */}
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="text-center mb-10">
                                <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Ваш профиль</h1>
                                <p className="text-neutral-500 mt-2">Так вас будут видеть в системе.</p>
                            </div>
                            <div className="space-y-5 mb-10">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Имя</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Ваше имя"
                                        className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl focus:bg-white focus:border-neutral-900 focus:outline-none transition-all"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Фамилия</label>
                                    <input
                                        type="text"
                                        value={surname}
                                        onChange={(e) => setSurname(e.target.value)}
                                        placeholder="Ваша фамилия"
                                        className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl focus:bg-white focus:border-neutral-900 focus:outline-none transition-all"
                                    />
                                </div>
                            </div>
                            <button
                                onClick={handleNext}
                                disabled={!isNameValid || isSubmitting}
                                className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-bold transition-all hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
                            >
                                <span>{isSubmitting ? "Сохранение..." : "Продолжить"}</span>
                                {!isSubmitting && <ArrowRight size={18} />}
                            </button>
                        </div>
                    )}

                    {/* Step 2: Subjects (Teachers only) */}
                    {step === 2 && role === "teacher" && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="text-center mb-10">
                                <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Предметы</h1>
                                <p className="text-neutral-500 mt-2">Выберите предметы, которые вы преподаете.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-10 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {SUBJECTS.map((subject) => (
                                    <button
                                        key={subject.id}
                                        onClick={() => toggleSubject(subject.id)}
                                        className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all gap-3 text-center ${selectedSubjects.includes(subject.id) ? "border-neutral-900 bg-neutral-50 shadow-sm" : "border-neutral-100 hover:border-neutral-200 bg-white"}`}
                                    >
                                        <span className="text-3xl">{subject.emoji}</span>
                                        <span className="text-[10px] font-black text-neutral-900 uppercase tracking-widest">{subject.name}</span>
                                        {selectedSubjects.includes(subject.id) && (
                                            <div className="absolute top-3 right-3 w-5 h-5 bg-neutral-900 rounded-full flex items-center justify-center">
                                                <Check size={12} className="text-white" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={handleFinish}
                                disabled={selectedSubjects.length === 0 || isSubmitting}
                                className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-bold transition-all hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
                            >
                                <span>{isSubmitting ? "Завершение..." : "Начать работу"}</span>
                                {!isSubmitting && <ArrowRight size={18} />}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
