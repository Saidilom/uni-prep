"use client";

import { useState } from "react";
import { signInWithGoogle } from "@/lib/auth-utils";
import { useAuthStore } from "@/store/useAuthStore";
import Image from "next/image";
import Plasma from "@/components/Plasma";
import Particles from "@/components/Particles";
import { BookOpen, Target, Award, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
    const [error, setError] = useState<string | null>(null);
    const { isLoading } = useAuthStore();

    const handleLogin = async () => {
        try {
            setError(null);
            await signInWithGoogle();
        } catch (err: any) {
            setError(err.message || "Ошибка при входе через Google");
        }
    };

    return (
        <div className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden">
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

            <div className="relative z-10 flex flex-col items-center w-full max-w-md px-4 py-16">
                {/* Logo Section */}
                <div className="mb-12 flex flex-col items-center animate-in fade-in slide-in-from-top-4 duration-700">
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

                {/* Login Card with Particles background */}
                <div className="relative w-full bg-white/5 border border-white/15 backdrop-blur-xl rounded-[2.5rem] shadow-[0_0_40px_rgba(0,0,0,0.35)] overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
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

                    <div className="relative z-10 p-12">
                        <div className="text-center mb-8">
                            <h2 className="text-4xl font-bold tracking-tight text-white mb-4 font-[var(--font-inter)]">
                                С возвращением
                            </h2>
                            <p className="text-white/70 text-base font-[var(--font-inter)] leading-relaxed">
                                Войдите, чтобы продолжить обучение и достигать новых высот
                            </p>
                        </div>

                        {error && (
                            <div className="mb-8 p-4 rounded-2xl bg-red-500/15 border border-red-400/30 text-red-300 text-sm backdrop-blur animate-in fade-in zoom-in duration-300 font-[var(--font-inter)]">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleLogin}
                            disabled={isLoading}
                            className="group relative w-full flex items-center justify-center gap-3 py-5 px-6 bg-white text-neutral-900 rounded-2xl font-semibold text-base transition-all hover:bg-neutral-100 active:scale-[0.98] disabled:opacity-50 overflow-hidden shadow-[0_18px_45px_rgba(0,0,0,0.45)] font-[var(--font-inter)] mb-10"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                            <Image
                                src="/google.png"
                                alt="Google"
                                width={22}
                                height={22}
                                className="relative z-10"
                            />
                            <span className="relative z-10">Войти через Google</span>
                        </button>

                        {/* Features list */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 text-white/80">
                                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
                                    <BookOpen className="w-5 h-5 text-white" />
                                </div>
                                <span className="text-sm font-[var(--font-inter)]">Структурированные материалы по всем предметам</span>
                            </div>
                            <div className="flex items-center gap-3 text-white/80">
                                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
                                    <Target className="w-5 h-5 text-white" />
                                </div>
                                <span className="text-sm font-[var(--font-inter)]">Адаптивные тесты с мгновенной обратной связью</span>
                            </div>
                            <div className="flex items-center gap-3 text-white/80">
                                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
                                    <Award className="w-5 h-5 text-white" />
                                </div>
                                <span className="text-sm font-[var(--font-inter)]">Отслеживание прогресса и достижений</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
