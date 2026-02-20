"use client";

import Link from "next/link";
import Image from "next/image";
import { Subject } from "@/lib/firestore-schema";
import { getSubjectImage } from "@/lib/constants";

interface SubjectCardProps {
    subject: Subject;
    stars?: number;
    medals?: {
        green: number;
        grey: number;
        bronze: number;
    };
    progress?: number; // процент прогресса (0-100)
}

export default function SubjectCard({
    subject,
    stars = 0,
    medals = { green: 0, grey: 0, bronze: 0 },
    progress = 0
}: SubjectCardProps) {

    // Автоматически подставляем изображение на основе ID и названия предмета
    const backgroundImage = getSubjectImage(subject.id, subject.name);

    // Вычисляем общее количество медалей
    const totalMedals = medals.green + medals.grey + medals.bronze;
    const hasProgress = progress > 0 || stars > 0 || totalMedals > 0;

    return (
        <Link
            href={`/subject/${subject.id}`}
            className="group relative h-64 rounded-2xl overflow-hidden cursor-pointer block"
        >
            {/* ФОТО ПРЕДМЕТА */}
            <Image
                src={backgroundImage}
                alt={subject.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
            />

            {/* ГРАДИЕНТНЫЙ ОВЕРЛЕЙ (тёмный снизу) */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/70" />

            {/* СОДЕРЖИМОЕ */}
            <div className="absolute inset-0 flex flex-col justify-between p-6">

                {/* ВЕРХ: ИКОНКА И НАЗВАНИЕ */}
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-xl backdrop-blur-sm">
                            {subject.emoji}
                        </div>
                    </div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">
                        {subject.name}
                    </h3>
                </div>

                {/* НИЗ: ПРОГРЕСС И КНОПКА */}
                <div className="space-y-4">

                    {/* ЗВЁЗДЫ И МЕДАЛИ */}
                    {hasProgress && (
                        <div className="flex gap-4 text-sm text-white/90">
                            {stars > 0 && (
                                <span className="flex items-center gap-1">
                                    <span className="text-base">⭐</span>
                                    <span className="font-semibold">{stars}</span>
                                </span>
                            )}
                            {medals.green > 0 && (
                                <span className="flex items-center gap-1">
                                    <span className="text-base">🟢</span>
                                    <span className="font-semibold">{medals.green}</span>
                                </span>
                            )}
                            {medals.grey > 0 && (
                                <span className="flex items-center gap-1 text-white/80">
                                    <span className="text-base">⚪</span>
                                    <span className="font-semibold">{medals.grey}</span>
                                </span>
                            )}
                            {medals.bronze > 0 && (
                                <span className="flex items-center gap-1 text-white/80">
                                    <span className="text-base">🥉</span>
                                    <span className="font-semibold">{medals.bronze}</span>
                                </span>
                            )}
                        </div>
                    )}

                    {/* ПОЛОСА ПРОГРЕССА */}
                    {progress > 0 && (
                        <div>
                            <p className="text-xs text-white/70 mb-2">{progress}% прогресса</p>
                            <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-white rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* КНОПКА */}
                    <div className="w-full py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 group/btn">
                        {hasProgress ? "Продолжить" : "Начать обучение"}
                        <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                    </div>

                </div>

            </div>
        </Link>
    );
}
