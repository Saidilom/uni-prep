"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Topic, Textbook, Subject } from "@/lib/firestore-schema";
import { fetchTextbookById, fetchTopicsByTextbook, fetchSubjectById } from "@/lib/data-fetching";
import Plasma from "@/components/Plasma";
import { BookOpen, PlayCircle, ChevronRight } from "lucide-react";

export default function TextbookPage() {
    const { id } = useParams();

    const [textbook, setTextbook] = useState<Textbook | null>(null);
    const [subject, setSubject] = useState<Subject | null>(null);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!id) return;

        const load = async () => {
            const [textbookData, topicsData] = await Promise.all([
                fetchTextbookById(id as string),
                fetchTopicsByTextbook(id as string)
            ]);

            setTextbook(textbookData);
            setTopics(topicsData);

            if (textbookData?.subjectId) {
                const subjectData = await fetchSubjectById(textbookData.subjectId);
                setSubject(subjectData);
            }

            setIsLoading(false);
        };

        load();
    }, [id]);

    if (isLoading) {
        return (
            <div className="relative min-h-screen">
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

                <div className="relative z-10 flex flex-col gap-6 py-16 animate-pulse">
                    <div className="h-5 w-40 bg-white/10 rounded-full" />
                    <div className="h-12 w-72 bg-white/10 rounded-2xl" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
                        {[1, 2, 3].map((n) => (
                            <div
                                key={n}
                                className="h-44 bg-white/5 border border-white/10 rounded-3xl"
                            />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!textbook) {
        return (
            <div className="relative min-h-screen flex items-center justify-center">
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
                <p className="relative z-10 text-white/60 text-lg font-medium">
                    Учебник не найден
                </p>
            </div>
        );
    }

    const topicsCount = topics.length;
    const totalQuestions = topics.reduce(
        (sum, topic) => sum + (topic.totalQuestions || 0),
        0
    );

    return (
        <div className="relative flex flex-col gap-10 py-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
            {/* Plasma background (как на главном экране) */}
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

            {/* Хлебные крошки как на странице предмета */}
            <nav className="relative z-10 flex items-center justify-between gap-4 text-xs sm:text-sm font-medium">
                <div className="flex items-center gap-2 text-white/40">
                    <Link href="/" className="hover:text-white transition-colors">
                        Главная
                    </Link>
                    {subject && (
                        <>
                            <ChevronRight size={14} className="text-white/20" />
                            <Link
                                href={`/subject/${subject.id}`}
                                className="hover:text-white transition-colors"
                            >
                                {subject.name}
                            </Link>
                        </>
                    )}
                    <ChevronRight size={14} className="text-white/20" />
                    <span className="text-white/85">
                        Учебник
                    </span>
                </div>

                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-white/50 bg-white/5 border border-white/10 rounded-full px-3 py-1 backdrop-blur">
                    {textbook.grade} КЛАСС
                </span>
            </nav>

            {/* Заголовок учебника (минималистично) */}
            <section className="relative z-10 flex flex-col gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur self-start">
                    <BookOpen className="w-4 h-4 text-white/80" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60">
                        Учебник
                    </span>
                </div>

                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight max-w-3xl">
                    {textbook.title}
                </h1>

                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs sm:text-sm text-white/60">
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                        {topicsCount} тем
                    </span>
                    {topicsCount > 0 && (
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur">
                            <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                            {totalQuestions} вопросов
                        </span>
                    )}
                </div>
            </section>

            {/* Сетка тем (карточки) */}
            <section className="relative z-10">
                {topicsCount > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {topics.map((topic, index) => (
                            <div
                                key={topic.id}
                                className="group relative p-5 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.35)] hover:bg-white/8 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                                style={{
                                    animationDelay: `${index * 80}ms`,
                                    animationFillMode: "both",
                                }}
                            >
                                {/* Лёгкое свечение при ховере */}
                                <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-radial-at-t from-white/15 via-transparent to-transparent" />

                                <div className="relative flex flex-col h-full gap-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1">
                                            <h3 className="text-base font-semibold text-white tracking-tight leading-snug line-clamp-2">
                                                {topic.title}
                                            </h3>
                                        </div>

                                        <div className="ml-2 inline-flex flex-col items-end gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">
                                                Тема {index + 1}
                                            </span>
                                            {typeof topic.totalQuestions === "number" && (
                                                <span className="text-[11px] font-medium text-white/70 bg-white/5 border border-white/10 rounded-full px-2 py-0.5 backdrop-blur">
                                                    {topic.totalQuestions} вопр.
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                                        <Link
                                            href={`/test/${topic.id}`}
                                            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-white text-neutral-900 text-xs sm:text-sm font-semibold shadow-[0_18px_45px_rgba(0,0,0,0.45)] hover:bg-neutral-100 active:scale-[0.97] transition-all"
                                        >
                                            <PlayCircle className="w-4 h-4" />
                                            Начать тест
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-20 px-6 text-center rounded-[2.5rem] border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_15px_45px_rgba(0,0,0,0.35)]">
                        <p className="text-white/60 font-medium">
                            Темы для этого учебника пока не добавлены.
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
}

