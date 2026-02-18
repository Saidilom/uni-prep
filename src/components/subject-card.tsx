"use client";

import Link from "next/link";
import { Subject } from "@/lib/firestore-schema";
import { useState } from "react";
import { BookOpen, Layers3 } from "lucide-react";
import { getSubjectImage } from "@/lib/constants";

interface SubjectCardProps {
    subject: Subject;
}

export default function SubjectCard({ subject }: SubjectCardProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [imageError, setImageError] = useState(false);
    
    // Автоматически подставляем изображение на основе ID и названия предмета
    // Всегда используем функцию маппинга, игнорируя backgroundImage из базы (если он есть)
    const backgroundImage = getSubjectImage(subject.id, subject.name);

    return (
        <div
            className="group relative h-[400px] rounded-3xl overflow-hidden bg-white/5 border border-white/10 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.35)] transition-all duration-500 hover:bg-white/7 hover:-translate-y-1 flex flex-col"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Top Section - Background Image */}
            <div className="relative h-56 overflow-hidden">
                <img
                    src={backgroundImage}
                    alt={subject.name}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    onError={() => setImageError(true)}
                />
                {/* Light gradient overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/15 z-10" />

                {/* Stats badges on image */}
                <div className="absolute bottom-4 left-4 right-4 flex gap-2 z-20">
                    <div className="px-3 py-1.5 bg-white/10 backdrop-blur rounded-lg border border-white/15">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-white/85">
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>{subject.topicCount || 0} учебников</span>
                        </span>
                    </div>
                    <div className="px-3 py-1.5 bg-white/10 backdrop-blur rounded-lg border border-white/15">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-white/85">
                            <Layers3 className="w-3.5 h-3.5" />
                            <span>{subject.questionCount || 0} тем</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Bottom Section - Content Area */}
            <div className="flex-1 p-6 bg-transparent flex flex-col">
                {/* Icon + Title */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-xl">
                        <span>{subject.emoji}</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">
                        {subject.name}
                    </h3>
                </div>

                {/* Start Button */}
                <div className="mt-auto">
                    <Link
                        href={`/subject/${subject.id}`}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-white/10 text-white rounded-xl font-bold text-sm transition-all hover:bg-white/15 active:scale-95 border border-white/15 backdrop-blur"
                    >
                        Начать обучение
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                    </Link>
                </div>
            </div>
        </div>
    );
}
