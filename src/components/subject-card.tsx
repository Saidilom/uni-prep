"use client";

import Link from "next/link";
import { Subject } from "@/lib/firestore-schema";

interface SubjectCardProps {
    subject: Subject;
}

export default function SubjectCard({ subject }: SubjectCardProps) {
    return (
        <Link
            href={`/subject/${subject.id}`}
            className="group relative h-64 rounded-[2.5rem] overflow-hidden border border-neutral-100 bg-white transition-all hover:border-neutral-200 hover:shadow-[0_30px_60px_rgba(0,0,0,0.1)] active:scale-[0.98] block"
        >
            {/* Background Image with Saturation Effect */}
            <div
                className="absolute inset-0 bg-cover bg-center grayscale opacity-10 transition-all duration-700 group-hover:scale-110 group-hover:grayscale-0 group-hover:opacity-25"
                style={{ backgroundImage: `url(${subject.backgroundImage})` }}
            />

            {/* Background Accent Gradient */}
            <div
                className="absolute top-0 right-0 w-48 h-48 blur-3xl opacity-20 transition-opacity group-hover:opacity-40"
                style={{ backgroundColor: subject.color || '#000' }}
            />

            <div className="absolute inset-0 p-8 flex flex-col justify-between">
                <div
                    className="w-16 h-16 rounded-2xl bg-white shadow-xl flex items-center justify-center text-4xl transform transition-all duration-500 group-hover:scale-110 group-hover:rotate-6"
                >
                    {subject.emoji}
                </div>

                <div className="relative z-10">
                    <h3 className="text-2xl font-bold text-neutral-900 tracking-tight mb-2 transition-colors">
                        {subject.name}
                    </h3>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-1 rounded-full" style={{ backgroundColor: subject.color }} />
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                            Начать подготовку
                        </p>
                    </div>
                </div>
            </div>
        </Link>
    );
}
