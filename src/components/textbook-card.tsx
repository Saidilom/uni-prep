"use client";

import Link from "next/link";
import { Textbook } from "@/lib/firestore-schema";

interface TextbookCardProps {
    textbook: Textbook;
}

import { BookOpen } from "lucide-react";

export default function TextbookCard({ textbook }: TextbookCardProps) {
    return (
        <Link
            href={`/textbook/${textbook.id}`}
            className="group block bg-white rounded-3xl border border-neutral-100 p-2 transition-all hover:border-neutral-200 hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] active:scale-[0.98]"
        >
            <div className="relative h-48 w-full bg-neutral-50 rounded-2xl overflow-hidden flex items-center justify-center transition-colors group-hover:bg-neutral-100">
                <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full border border-neutral-200 shadow-sm transition-transform group-hover:scale-105">
                    <span className="text-[10px] font-bold text-neutral-900 uppercase tracking-widest">{textbook.grade} класс</span>
                </div>

                <div className="w-16 h-20 bg-white rounded-lg border border-neutral-200 shadow-sm flex items-center justify-center transform -rotate-3 transition-transform group-hover:rotate-0 group-hover:scale-110 duration-500">
                    <BookOpen size={24} className="text-neutral-300 group-hover:text-blue-600 transition-colors" />
                </div>
            </div>

            <div className="p-6">
                <h3 className="text-lg font-bold text-neutral-900 tracking-tight leading-snug group-hover:text-blue-600 transition-colors">
                    {textbook.title}
                </h3>
                <div className="flex items-center gap-2 mt-4">
                    <div className="w-1 h-1 rounded-full bg-neutral-300" />
                    <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                        Начать обучение
                    </p>
                </div>
            </div>
        </Link>
    );
}
