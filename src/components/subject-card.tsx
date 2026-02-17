"use client";

import Link from "next/link";
import { Subject } from "@/lib/firestore-schema";
import { useState } from "react";

interface SubjectCardProps {
    subject: Subject;
}

export default function SubjectCard({ subject }: SubjectCardProps) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="group relative h-[400px] rounded-3xl overflow-hidden bg-white border border-neutral-200 transition-all duration-500 hover:shadow-xl hover:shadow-neutral-900/5 hover:-translate-y-1 flex flex-col"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Top Section - Background Image */}
            <div className="relative h-44 overflow-hidden">
                <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                    style={{ backgroundImage: `url(${subject.backgroundImage})` }}
                />
                {/* Gradient overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20" />

                {/* Stats badges on image */}
                <div className="absolute bottom-4 left-4 right-4 flex gap-2">
                    <div className="px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm">
                        <span className="text-xs font-semibold text-neutral-700">
                            📚 {subject.topicCount || 0} учебников
                        </span>
                    </div>
                    <div className="px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm">
                        <span className="text-xs font-semibold text-neutral-700">
                            📖 {subject.questionCount || 0} тем
                        </span>
                    </div>
                </div>
            </div>

            {/* Bottom Section - White Content Area */}
            <div className="flex-1 p-6 bg-white flex flex-col">
                {/* Title */}
                <h3 className="text-2xl font-bold text-neutral-900 tracking-tight mb-6">
                    {subject.name}
                </h3>

                {/* Start Button */}
                <div className="mt-auto">
                    <Link
                        href={`/subject/${subject.id}`}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-neutral-900 text-white rounded-xl font-bold text-sm transition-all hover:bg-neutral-800 active:scale-95"
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
