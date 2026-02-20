"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Textbook, Subject } from "@/lib/firestore-schema";
import { fetchTextbooksBySubject, fetchSubjectById } from "@/lib/data-fetching";
import TextbookCard from "@/components/textbook-card";
import { ChevronRight } from "lucide-react";
import Plasma from "@/components/Plasma";

export default function SubjectPage() {
    const { id } = useParams();
    const [textbooks, setTextbooks] = useState<Textbook[]>([]);
    const [subject, setSubject] = useState<Subject | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (id) {
            Promise.all([
                fetchSubjectById(id as string),
                fetchTextbooksBySubject(id as string)
            ]).then(([subData, textData]) => {
                setSubject(subData);
                setTextbooks(textData);
                setIsLoading(false);
            });
        }
    }, [id]);

    if (isLoading) return (
        <div className="relative min-h-screen">
            <div className="fixed inset-0 z-0">
                <Plasma color="#ffffff" speed={1.0} direction="forward" scale={1.2} opacity={0.9} mouseInteractive={true} />
            </div>
            <div className="relative z-10 flex flex-col gap-6 py-16 animate-pulse">
                <div className="h-5 w-40 bg-white/10 rounded-full" />
                <div className="h-12 w-72 bg-white/10 rounded-2xl" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-4">
                    {[1, 2, 3, 4].map(n => <div key={n} className="h-64 bg-white/5 border border-white/10 rounded-3xl" />)}
                </div>
            </div>
        </div>
    );

    if (!subject) return (
        <div className="relative min-h-screen flex items-center justify-center">
            <div className="fixed inset-0 z-0">
                <Plasma color="#ffffff" speed={1.0} direction="forward" scale={1.2} opacity={0.9} mouseInteractive={true} />
            </div>
            <p className="relative z-10 text-white/50 text-lg font-medium">Предмет не найден</p>
        </div>
    );

    return (
        <div className="relative flex flex-col gap-12 py-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
            {/* Plasma background */}
            <div className="fixed inset-0 z-0">
                <Plasma color="#ffffff" speed={1.0} direction="forward" scale={1.2} opacity={0.9} mouseInteractive={true} />
            </div>

            {/* Breadcrumbs */}
            <nav className="relative z-10 flex items-center gap-2 text-sm text-white/40 font-medium">
                <Link href="/" className="hover:text-white transition-colors">
                    Главная
                </Link>
                <ChevronRight size={14} className="text-white/20" />
                <span className="text-white">{subject.name}</span>
            </nav>

            {/* Header */}
            <section className="relative z-10">
                <div className="flex items-center gap-4 mb-3">
                    <span className="text-5xl sm:text-6xl">{subject.emoji}</span>
                    <div>
                        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
                            {subject.name}
                        </h1>
                        <p className="text-white/40 text-sm sm:text-base mt-1 leading-relaxed max-w-2xl">
                            Выберите учебник, чтобы просмотреть доступные темы и начать обучение.
                        </p>
                    </div>
                </div>
            </section>

            {/* Textbooks grid */}
            <section className="relative z-10">
                {textbooks.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {textbooks.map((textbook) => (
                            <TextbookCard key={textbook.id} textbook={textbook} />
                        ))}
                    </div>
                ) : (
                    <div className="py-24 text-center rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
                        <p className="text-white/40 font-medium">Учебники для этого предмета пока не добавлены.</p>
                    </div>
                )}
            </section>
        </div>
    );
}
