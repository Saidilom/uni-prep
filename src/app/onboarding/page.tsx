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
import Plasma from "@/components/Plasma";
import Particles from "@/components/Particles";

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
        <div className="relative flex flex-col items-center justify-center min-h-screen p-4 py-24 overflow-hidden">
            {/* Plasma background */}
            <div className="fixed inset-0 z-0">
                <Plasma
                    color="#ffffff"
                    speed={1.0}
                    direction="forward"
                    scale={1.2}
                    opacity={0.9}
                    mouseInteractive={true}
                />
            </div>

            <div className="relative z-10 w-full max-w-md">
                <div className="text-center mb-10 flex flex-col items-center animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="relative w-64 h-28 transition-transform hover:scale-105 duration-300">
                        <Image
                            src="/лого.png"
                            alt="Uni-Prep Logo"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                </div>

                <div className="relative bg-white/5 border border-white/15 backdrop-blur-xl rounded-[2.5rem] shadow-[0_0_40px_rgba(0,0,0,0.35)] overflow-hidden">
                    {/* Particles background inside card */}
                    <div className="absolute inset-0 z-0">
                        <Particles
                            className=""
                            particleCount={150}
                            particleSpread={6}
                            speed={0.2}
                            particleColors={['#ffffff', '#888888', '#ffffff']}
                            moveParticlesOnHover={false}
                            particleHoverFactor={0}
                            alphaParticles={true}
                            particleBaseSize={80}
                            sizeRandomness={0.5}
                            cameraDistance={15}
                            disableRotation={false}
                        />
                    </div>
                    {/* Reflective glow overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none z-0" />

                    <div className="relative z-10 p-8 md:p-10">
                    {/* Step Progress */}
                    <div className="flex justify-center gap-2 mb-8">
                        {[0, 1, ...(role === "teacher" ? [2] : [])].map((s) => (
                            <div
                                key={s}
                                className={`h-1.5 rounded-full transition-all duration-500 ${step === s ? "w-8 bg-white" : "w-2 bg-white/30"}`}
                            />
                        ))}
                    </div>

                    {/* Step 0: Role Selection */}
                    {step === 0 && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="text-center mb-10">
                                <h1 className="text-3xl font-bold tracking-tight text-white font-[var(--font-inter)] mb-2">Кто вы?</h1>
                                <p className="text-white/60 text-sm font-[var(--font-inter)]">Выберите вашу роль в системе</p>
                            </div>
                            <div className="grid grid-cols-1 gap-4 mb-10">
                                <button
                                    onClick={() => setRole("student")}
                                    className={`group relative p-6 rounded-2xl border-2 transition-all flex items-center gap-5 text-left backdrop-blur ${role === "student" ? "border-white bg-white/10 text-white" : "border-white/20 hover:border-white/40 bg-white/5 text-white/80"}`}
                                >
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${role === "student" ? "bg-white/20" : "bg-white/10"}`}>
                                        <GraduationCap size={24} className={role === "student" ? "text-white" : "text-white/70"} />
                                    </div>
                                    <div className="flex-1">
                                        <span className="block font-bold text-lg font-[var(--font-inter)]">Ученик</span>
                                        <span className={`text-xs font-[var(--font-inter)] ${role === "student" ? "text-white/70" : "text-white/50"}`}>Хочу учиться и достигать новых высот</span>
                                    </div>
                                    {role === "student" && <Check size={20} className="text-white" />}
                                </button>

                                <button
                                    onClick={() => setRole("teacher")}
                                    className={`group relative p-6 rounded-2xl border-2 transition-all flex items-center gap-5 text-left backdrop-blur ${role === "teacher" ? "border-white bg-white/10 text-white" : "border-white/20 hover:border-white/40 bg-white/5 text-white/80"}`}
                                >
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${role === "teacher" ? "bg-white/20" : "bg-white/10"}`}>
                                        <User size={24} className={role === "teacher" ? "text-white" : "text-white/70"} />
                                    </div>
                                    <div className="flex-1">
                                        <span className="block font-bold text-lg font-[var(--font-inter)]">Учитель</span>
                                        <span className={`text-xs font-[var(--font-inter)] ${role === "teacher" ? "text-white/70" : "text-white/50"}`}>Хочу делиться знаниями и управлять классами</span>
                                    </div>
                                    {role === "teacher" && <Check size={20} className="text-white" />}
                                </button>
                            </div>
                            <button
                                onClick={handleNext}
                                disabled={!role}
                                className="w-full py-4 bg-white text-neutral-900 rounded-2xl font-semibold transition-all hover:bg-neutral-100 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2 shadow-[0_18px_45px_rgba(0,0,0,0.45)] font-[var(--font-inter)]"
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
                                <h1 className="text-3xl font-bold tracking-tight text-white font-[var(--font-inter)] mb-2">Ваш профиль</h1>
                                <p className="text-white/60 text-sm font-[var(--font-inter)]">Так вас будут видеть в системе</p>
                            </div>
                            <div className="space-y-5 mb-10">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-white/60 uppercase tracking-widest ml-1 font-[var(--font-inter)]">Имя</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Ваше имя"
                                        className="w-full p-4 bg-white/5 border border-white/20 rounded-2xl focus:bg-white/10 focus:border-white/40 focus:outline-none transition-all text-white placeholder:text-white/30 font-[var(--font-inter)]"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-white/60 uppercase tracking-widest ml-1 font-[var(--font-inter)]">Фамилия</label>
                                    <input
                                        type="text"
                                        value={surname}
                                        onChange={(e) => setSurname(e.target.value)}
                                        placeholder="Ваша фамилия"
                                        className="w-full p-4 bg-white/5 border border-white/20 rounded-2xl focus:bg-white/10 focus:border-white/40 focus:outline-none transition-all text-white placeholder:text-white/30 font-[var(--font-inter)]"
                                    />
                                </div>
                            </div>
                            <button
                                onClick={handleNext}
                                disabled={!isNameValid || isSubmitting}
                                className="w-full py-4 bg-white text-neutral-900 rounded-2xl font-semibold transition-all hover:bg-neutral-100 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2 shadow-[0_18px_45px_rgba(0,0,0,0.45)] font-[var(--font-inter)]"
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
                                <h1 className="text-3xl font-bold tracking-tight text-white font-[var(--font-inter)] mb-2">Предметы</h1>
                                <p className="text-white/60 text-sm font-[var(--font-inter)]">Выберите предметы, которые вы преподаете</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-10 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {SUBJECTS.map((subject) => (
                                    <button
                                        key={subject.id}
                                        onClick={() => toggleSubject(subject.id)}
                                        className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all gap-3 text-center backdrop-blur ${selectedSubjects.includes(subject.id) ? "border-white bg-white/10 shadow-sm" : "border-white/20 hover:border-white/40 bg-white/5"}`}
                                    >
                                        <span className="text-3xl">{subject.emoji}</span>
                                        <span className="text-[10px] font-black text-white uppercase tracking-widest font-[var(--font-inter)]">{subject.name}</span>
                                        {selectedSubjects.includes(subject.id) && (
                                            <div className="absolute top-3 right-3 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                                                <Check size={12} className="text-neutral-900" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={handleFinish}
                                disabled={selectedSubjects.length === 0 || isSubmitting}
                                className="w-full py-4 bg-white text-neutral-900 rounded-2xl font-semibold transition-all hover:bg-neutral-100 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2 shadow-[0_18px_45px_rgba(0,0,0,0.45)] font-[var(--font-inter)]"
                            >
                                <span>{isSubmitting ? "Завершение..." : "Начать работу"}</span>
                                {!isSubmitting && <ArrowRight size={18} />}
                            </button>
                        </div>
                    )}
                    </div>
                </div>
            </div>
        </div>
    );
}
