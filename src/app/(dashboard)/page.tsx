"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useSubjectsStore } from "@/store/useSubjectsStore";
import { useStatsStore } from "@/store/useStatsStore";
import SubjectCard from "@/components/subject-card";
import { fetchUserSubjectRatings, fetchSubjectProgress } from "@/lib/stats-utils";
import { fetchSubjects, fetchTextbooksBySubject, fetchTopicsByTextbook } from "@/lib/data-fetching";
import { Copy, Check } from "lucide-react";

export default function HomePage() {
    const { user } = useAuthStore();
    const [copied, setCopied] = useState(false);

    const copyStudentId = () => {
        if (!user) return;
        navigator.clipboard.writeText(user.shortId || user.id);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    const { subjects, loaded: subjectsLoaded, setSubjects } = useSubjectsStore();
    const {
        subjectProgress,
        loadedForUser,
        setSubjectProgress, setRatings, setLoadedForUser,
    } = useStatsStore();

    const isLoading = !subjectsLoaded;

    useEffect(() => {
        // Subjects are global — load once, stored in useSubjectsStore
        if (!subjectsLoaded) {
            fetchSubjects().then(setSubjects);
        }
    }, [subjectsLoaded, setSubjects]);

    useEffect(() => {
        if (!user || !subjectsLoaded) return;
        // Already loaded for this user — skip all Firestore calls
        if (loadedForUser === user.id) return;

        const load = async () => {
            const ratings = await fetchUserSubjectRatings(user.id);
            setRatings(ratings);
            setLoadedForUser(user.id);

            await Promise.all(
                subjects.map(async (subject) => {
                    const textbooks = await fetchTextbooksBySubject(subject.id);
                    const allTopicIds = (
                        await Promise.all(textbooks.map((tb) => fetchTopicsByTextbook(tb.id)))
                    ).flat().map((t) => t.id);
                    const progress = await fetchSubjectProgress(user.id, subject.id, allTopicIds);
                    setSubjectProgress(subject.id, {
                        stars: ratings[subject.id] || 0,
                        medals: progress.medals,
                        progress: progress.progress,
                    });
                })
            );
        };

        load();
    }, [user, subjectsLoaded, subjects, loadedForUser, setRatings, setLoadedForUser, setSubjectProgress]);

    return (
        <div className="flex flex-col gap-12 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">

            {/* Profile header */}
            {user ? (
                <section className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:bg-muted/30">
                    <div>
                        <p className="text-sm font-semibold text-foreground">
                            {user.name} {user.surname || ""}
                        </p>
                        <p className="text-xs text-muted-foreground">С возвращением</p>
                    </div>
                    <button
                        type="button"
                        onClick={copyStudentId}
                        className="inline-flex items-center gap-2 self-start rounded-xl border border-border bg-background px-4 py-2 font-mono text-sm font-bold tracking-wide text-foreground transition-colors hover:bg-muted sm:self-auto"
                    >
                        {user.shortId || user.id}
                        {copied ? (
                            <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
                        ) : (
                            <Copy className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
                        )}
                    </button>
                </section>
            ) : null}

            {/* Subjects Grid */}
            <section>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Доступные предметы</h2>
                    <span className="self-start rounded-xl border border-border bg-muted px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground sm:self-auto sm:text-sm">
                        {subjects.length} предметов
                    </span>
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                            <div key={n} className="h-[116px] animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {subjects.map((subject) => {
                            const progress = subjectProgress[subject.id] || {
                                stars: 0,
                                medals: { green: 0, grey: 0, bronze: 0 },
                                progress: 0,
                            };
                            return (
                                <SubjectCard
                                    key={subject.id}
                                    subject={subject}
                                    stars={progress.stars}
                                    medals={progress.medals}
                                    progress={progress.progress}
                                />
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Footer Support */}
            <section className="rounded-3xl border border-border bg-muted/50 py-16 text-center dark:bg-muted/30">
                <div className="px-8">
                    <h2 className="mb-4 text-3xl font-bold text-foreground">Нужна помощь?</h2>
                    <p className="mx-auto mb-8 max-w-md font-medium text-muted-foreground">
                        Наша команда всегда на связи, чтобы помочь вам с любыми вопросами по обучению.
                    </p>
                    <button
                        type="button"
                        className="rounded-2xl bg-foreground px-9 py-3.5 font-bold text-background shadow-sm transition-all hover:opacity-90 active:scale-95"
                    >
                        Написать в поддержку
                    </button>
                </div>
            </section>
        </div>
    );
}
