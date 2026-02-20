"use client";

import Link from "next/link";
import { Textbook } from "@/lib/firestore-schema";
import { BookOpen, ArrowRight } from "lucide-react";

interface TextbookCardProps {
    textbook: Textbook;
}

export default function TextbookCard({ textbook }: TextbookCardProps) {
    return (
        <Link
            href={`/textbook/${textbook.id}`}
            className="group block bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.25)] hover:bg-white/10 hover:-translate-y-1 transition-all duration-300 active:scale-[0.98]"
        >
            {/* Top image area */}
            <div className="relative h-40 w-full bg-white/5 flex items-center justify-center overflow-hidden">
                {/* Grade badge */}
                <div className="absolute top-3 right-3 bg-white/10 border border-white/15 backdrop-blur px-2.5 py-1 rounded-full">
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">{textbook.grade} класс</span>
                </div>

                {/* Book icon */}
                <div className="w-14 h-18 bg-white/10 border border-white/20 rounded-xl flex items-center justify-center transform -rotate-3 group-hover:rotate-0 group-hover:scale-110 transition-all duration-500 shadow-lg p-4">
                    <BookOpen size={26} className="text-white/60 group-hover:text-white transition-colors" />
                </div>

                {/* Subtle glow on hover */}
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Info */}
            <div className="p-5">
                <h3 className="text-base font-bold text-white tracking-tight leading-snug group-hover:text-white transition-colors line-clamp-2">
                    {textbook.title}
                </h3>
                <div className="flex items-center gap-1.5 mt-3 text-white/40 group-hover:text-white/70 transition-colors">
                    <span className="text-xs font-bold uppercase tracking-widest">Открыть</span>
                    <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                </div>
            </div>
        </Link>
    );
}
