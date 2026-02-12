"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Textbook, Subject } from "@/lib/firestore-schema";
import { fetchTextbooksBySubject, fetchSubjectById } from "@/lib/data-fetching";
import TextbookCard from "@/components/textbook-card";
import { ChevronRight } from "lucide-react";

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

    if (isLoading) return <div className="animate-pulse h-96 bg-neutral-50 rounded-2xl" />;
    if (!subject) return <div className="py-24 text-center">Предмет не найден</div>;

    return (
        <div className="flex flex-col gap-12">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 text-sm text-neutral-500 font-medium tracking-tight">
                <Link href="/" className="hover:text-neutral-900 transition-colors">
                    Главная
                </Link>
                <ChevronRight size={14} className="text-neutral-300" />
                <span className="text-neutral-900">{subject.name}</span>
            </nav>

            {/* Header */}
            <section>
                <div className="flex items-center gap-4 mb-4">
                    <span className="text-5xl">{subject.emoji}</span>
                    <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">
                        Учебники: {subject.name}.
                    </h1>
                </div>
                <p className="text-neutral-500 leading-relaxed max-w-2xl">
                    Выберите учебник, чтобы просмотреть доступные темы и начать обучение по предмету {subject.name.toLowerCase()}.
                </p>
            </section>

            {/* Content */}
            <section>
                {isLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        {[1, 2, 3, 4].map((n) => (
                            <div key={n} className="h-80 bg-neutral-50 rounded-xl animate-pulse border border-neutral-100" />
                        ))}
                    </div>
                ) : textbooks.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        {textbooks.map((textbook) => (
                            <TextbookCard key={textbook.id} textbook={textbook} />
                        ))}
                    </div>
                ) : (
                    <div className="py-24 text-center rounded-2xl border-2 border-dashed border-neutral-100">
                        <p className="text-neutral-400 font-medium">Учебники для этого предмета пока не найдены.</p>
                    </div>
                )}
            </section>
        </div>
    );
}
