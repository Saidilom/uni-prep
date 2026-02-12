"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Textbook, Topic, Subject } from "@/lib/firestore-schema";
import { fetchTextbookById, fetchTopicsByTextbook, fetchSubjectById } from "@/lib/data-fetching";
import { ChevronRight } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function TextbookTopicsPage() {
    const { id } = useParams();
    const { user } = useAuthStore();
    const [textbook, setTextbook] = useState<Textbook | null>(null);
    const [subject, setSubject] = useState<Subject | null>(null);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [userProgress, setUserProgress] = useState<Record<string, any>>({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (id) {
            fetchTextbookById(id as string).then(async (textbookData) => {
                if (textbookData) {
                    setTextbook(textbookData);
                    const [topicsData, subjectData] = await Promise.all([
                        fetchTopicsByTextbook(textbookData.id),
                        fetchSubjectById(textbookData.subjectId)
                    ]);
                    setTopics(topicsData);
                    setSubject(subjectData);

                    // Fetch user progress for these topics
                    if (user) {
                        const progressRef = collection(db, "users", user.id, "userProgress");
                        const progressSnap = await getDocs(progressRef);
                        const progressMap: Record<string, any> = {};
                        progressSnap.forEach(doc => {
                            progressMap[doc.id] = doc.data();
                        });
                        setUserProgress(progressMap);
                    }
                }
                setIsLoading(false);
            });
        }
    }, [id, user]);

    if (isLoading) return <div className="animate-pulse h-96 bg-neutral-50 rounded-2xl" />;
    if (!textbook) return <div className="py-24 text-center">Учебник не найден</div>;

    const getMedalIcon = (medal: string) => {
        switch (medal) {
            case "green": return "🟢";
            case "grey": return "⚪";
            case "bronze": return "🥉";
            default: return "⬜";
        }
    };

    return (
        <div className="flex flex-col gap-12">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 text-sm text-neutral-500 font-medium tracking-tight">
                <Link href="/" className="hover:text-neutral-900 transition-colors">
                    Главная
                </Link>
                <ChevronRight size={14} className="text-neutral-300" />
                {subject && (
                    <>
                        <Link href={`/subject/${subject.id}`} className="hover:text-neutral-900 transition-colors">
                            {subject.name}
                        </Link>
                        <ChevronRight size={14} className="text-neutral-300" />
                    </>
                )}
                <span className="text-neutral-900">{textbook.title}</span>
            </nav>

            {/* Header */}
            <section>
                <div className="flex flex-col gap-2 mb-4">
                    <span className="text-sm font-semibold text-neutral-400 uppercase tracking-widest">
                        {subject?.name}
                    </span>
                    <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">
                        Темы учебника.
                    </h1>
                </div>
                <p className="text-neutral-500 leading-relaxed max-w-2xl">
                    {textbook.title} — {textbook.grade} класс. Выберите тему, чтобы начать тест.
                </p>
            </section>

            {/* Topics List */}
            <section className="flex flex-col gap-3">
                {topics.length > 0 ? (
                    topics.map((topic) => {
                        const progress = userProgress[topic.id];
                        return (
                            <Link
                                key={topic.id}
                                href={`/test/${topic.id}`}
                                className="group flex items-center justify-between p-6 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-all active:scale-[0.99]"
                            >
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-lg font-semibold text-neutral-900 group-hover:text-blue-600 transition-colors">
                                        {topic.title}
                                    </h3>
                                    <div className="flex items-center gap-4 text-sm text-neutral-500">
                                        <span>Вопросы: {progress?.solvedQuestions || 0} / {topic.totalQuestions || 0}</span>
                                    </div>
                                </div>
                                <div className="text-3xl">
                                    {getMedalIcon(progress?.medal)}
                                </div>
                            </Link>
                        );
                    })
                ) : (
                    <div className="py-24 text-center rounded-2xl border-2 border-dashed border-neutral-100">
                        <p className="text-neutral-400 font-medium">Темы для этого учебника пока не добавлены.</p>
                    </div>
                )}
            </section>
        </div>
    );
}
