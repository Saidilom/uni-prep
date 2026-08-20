"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Clock, ArrowLeft, CheckCircle2, Trophy, X, Calendar, Timer } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import supabase from "@/lib/supabase/client";

type Section = {
    id: string;
    title: string;
    questions: Question[];
};

type Question = {
    id: string;
    text: string;
    options: Record<string, string>;
    points: number;
};

type AnswerState = Record<string, string>;

type SectionScore = { title: string; score: number; total: number };

type AnswerDetail = {
    questionId: string;
    sectionId?: string;
    selectedAnswer: string;
    isCorrect: boolean;
    pointsEarned: number;
};

type MockResult = {
    resultId: string;
    score: number;
    total: number;
    percentage: number;
    sectionScores: Record<string, SectionScore>;
    answers: AnswerDetail[];
};

export default function MockTestPage() {
    const { id } = useParams();
    const router = useRouter();
    const { user } = useAuthStore();
    const [sections, setSections] = useState<Section[]>([]);
    const [testTitle, setTestTitle] = useState("");
    const [answers, setAnswers] = useState<AnswerState>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<MockResult | null>(null);
    const [showAnswers, setShowAnswers] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
    const [timeSpent, setTimeSpent] = useState(0);
    const [sectionIdx, setSectionIdx] = useState(0);
    const [qIdx, setQIdx] = useState(0);
    const autoSubmittedRef = useRef(false);

    const load = useCallback(async () => {
        if (!id || !user) return;
        setLoading(true);
        const { data: accessData } = await supabase.from("mock_access").select("*").eq("user_id", user.id).eq("mock_test_id", id as string).single();
        if (!accessData) {
            router.push("/mock");
            return;
        }
        const { data: testRow } = await supabase.from("mock_tests").select("title, duration_minutes").eq("id", id as string).single();
        if (testRow?.title) setTestTitle(testRow.title);
        if (testRow?.duration_minutes) {
            const totalSeconds = testRow.duration_minutes * 60;
            setDurationSeconds(totalSeconds);
            const storageKey = `mock_start_${id}_${user.id}`;
            const storedStart = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
            if (storedStart) {
                const elapsed = Math.floor((Date.now() - Number(storedStart)) / 1000);
                setTimeLeft(Math.max(0, totalSeconds - elapsed));
            } else {
                if (typeof window !== "undefined") window.localStorage.setItem(storageKey, String(Date.now()));
                setTimeLeft(totalSeconds);
            }
        }
        const { data: sectionsData } = await supabase.from("mock_sections").select("*").eq("mock_test_id", id as string).order("order");
        if (!sectionsData || sectionsData.length === 0) {
            setLoading(false);
            return;
        }
        const sectionsWithQuestions: Section[] = [];
        for (const sec of sectionsData) {
            const { data: qs } = await supabase.rpc("get_mock_questions", { p_section_id: sec.id });
            sectionsWithQuestions.push({ id: sec.id, title: sec.title, questions: (qs || []) as Question[] });
        }
        setSections(sectionsWithQuestions);
        setLoading(false);
    }, [id, user, router]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (timeLeft === null || timeLeft <= 0 || result) return;
        const timer = setInterval(() => setTimeLeft((t) => (t !== null && t > 0 ? t - 1 : 0)), 1000);
        return () => clearInterval(timer);
    }, [timeLeft, result]);

    const handleSubmit = useCallback(async () => {
        if (!id || submitting || result) return;
        setSubmitting(true);
        try {
            const spent = durationSeconds !== null ? durationSeconds - (timeLeft ?? 0) : 0;
            const { data } = await supabase.rpc("submit_mock", {
                p_mock_test_id: id as string,
                p_answers: answers,
                p_time_spent_seconds: Math.max(0, spent),
            });
            if (data) {
                setResult(data as MockResult);
                setTimeSpent(Math.max(0, spent));
                if (user && typeof window !== "undefined") {
                    window.localStorage.removeItem(`mock_start_${id}_${user.id}`);
                }
            }
        } finally {
            setSubmitting(false);
        }
    }, [id, submitting, result, durationSeconds, timeLeft, answers, user]);

    useEffect(() => {
        if (
            timeLeft === 0 &&
            sections.length > 0 &&
            !submitting &&
            !result &&
            !autoSubmittedRef.current
        ) {
            autoSubmittedRef.current = true;
            handleSubmit();
        }
    }, [timeLeft, sections.length, submitting, result, handleSubmit]);

    const questionMap = useMemo(() => {
        const m = new Map<string, { text: string; sectionTitle: string }>();
        sections.forEach((s) => s.questions.forEach((q) => m.set(q.id, { text: q.text, sectionTitle: s.title })));
        return m;
    }, [sections]);

    const allQuestions = useMemo(() => sections.flatMap((s) => s.questions), [sections]);

    const fmtTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    const fmtDate = (d: Date) => d.toLocaleString("ru-RU");

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="h-10 w-28 animate-pulse rounded-3xl border border-border bg-muted" />
            </div>
        );
    }

    if (!sections.length) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="max-w-md rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-sm">
                    <h2 className="mb-3 text-2xl font-bold text-foreground">Тест не найден</h2>
                    <p className="text-sm text-muted-foreground">Проверьте ссылку и попробуйте снова.</p>
                </div>
            </div>
        );
    }

    if (result) {
        const sectionEntries = Object.entries(result.sectionScores || {});
        return (
            <div className="mx-auto flex max-w-2xl animate-in fade-in slide-in-from-bottom-4 flex-col gap-8 py-6 duration-700">
                <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--brand-blue-soft))] text-[hsl(var(--brand-blue))]">
                            <Trophy size={24} />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Результат</h1>
                    </div>
                    {testTitle ? <p className="mt-2 text-sm text-muted-foreground">{testTitle}</p> : null}

                    <div className="mt-8">
                        <div className="text-6xl font-extrabold tabular-nums text-foreground">{result.percentage}%</div>
                        <p className="mt-2 text-sm text-muted-foreground">{result.score} / {result.total} правильных ответов</p>
                    </div>

                    <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Calendar size={12} /> {fmtDate(new Date())}</span>
                        {timeSpent > 0 && (
                            <span className="inline-flex items-center gap-1"><Timer size={12} /> {fmtTime(timeSpent)}</span>
                        )}
                    </div>

                    {sectionEntries.length > 0 && (
                        <div className="mt-8 space-y-3 text-left">
                            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">Разбивка по секциям</h3>
                            {sectionEntries.map(([sectionId, s]) => {
                                const pct = s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
                                return (
                                    <div key={sectionId} className="rounded-2xl border border-border bg-muted/40 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-sm font-semibold text-foreground">{s.title}</span>
                                            <span className="text-sm font-bold tabular-nums text-foreground">{s.score} / {s.total}</span>
                                        </div>
                                        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden border border-border">
                                            <div className="h-full rounded-full bg-[hsl(var(--brand-blue))]" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {result.answers && result.answers.length > 0 && (
                        <button
                            onClick={() => setShowAnswers(true)}
                            className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-border px-6 py-3 text-sm font-semibold hover:bg-muted transition-colors"
                        >
                            Подробности ответов
                        </button>
                    )}

                    <button onClick={() => router.push("/mock")} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97]">
                        <ArrowLeft size={18} /> К каталогу
                    </button>
                </div>

                {showAnswers && result.answers && (
                    <div className="fixed inset-0 z-[500] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAnswers(false)}>
                        <div className="w-full max-w-2xl rounded-3xl border border-border bg-card shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-6 border-b border-border flex items-center justify-between">
                                <h2 className="text-xl font-bold text-foreground">Детализация ответов</h2>
                                <button onClick={() => setShowAnswers(false)} className="h-9 w-9 rounded-2xl border border-border bg-card hover:bg-muted transition-colors flex items-center justify-center">
                                    <X size={16} className="text-muted-foreground" />
                                </button>
                            </div>
                            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
                                {result.answers.map((a, i) => {
                                    const q = questionMap.get(a.questionId);
                                    return (
                                        <div key={i} className={`rounded-xl border p-4 ${a.isCorrect ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30" : "border-red-200 bg-red-50 dark:bg-red-950/30"}`}>
                                            {q?.sectionTitle ? <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{q.sectionTitle}</p> : null}
                                            <p className="mt-0.5 text-sm font-medium text-foreground">{i + 1}. {q?.text || "Вопрос"}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Ваш ответ: {a.selectedAnswer ? a.selectedAnswer.toUpperCase() : "—"} {a.isCorrect ? "✓" : "✗"}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const section = sections[sectionIdx];
    const q = section?.questions[qIdx];
    const isLast = sectionIdx === sections.length - 1 && qIdx === section.questions.length - 1;
    const unansweredCount = allQuestions.filter((question) => !answers[question.id]).length;

    return (
        <div className="mx-auto flex max-w-2xl animate-in fade-in slide-in-from-bottom-4 flex-col gap-8 py-6 duration-700">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{testTitle || "Mock-тест"}</h1>
                    <p className="mt-1 text-xs text-muted-foreground">Секция {sectionIdx + 1}/{sections.length} — {section.title} • Вопрос {qIdx + 1}/{section.questions.length}</p>
                </div>
                {timeLeft !== null && (
                    <div className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold tabular-nums ${timeLeft < 60 ? "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40" : "border-border bg-muted text-foreground"}`}>
                        <Clock size={16} /> {fmtTime(timeLeft)}
                    </div>
                )}
            </div>

            <div className="h-2 rounded-full bg-muted overflow-hidden border border-border">
                <div className="h-full rounded-full bg-[hsl(var(--brand-blue))] transition-all duration-500" style={{ width: `${((qIdx + 1) / section.questions.length) * 100}%` }} />
            </div>

            {q && (
                <div className="rounded-3xl border border-border bg-card p-8 shadow-sm space-y-6">
                    <p className="text-lg font-semibold text-foreground">{q.text}</p>
                    <div className="grid grid-cols-1 gap-3">
                        {["a", "b", "c", "d"].map((key) => (
                            q.options[key] && (
                                <button
                                    key={key}
                                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: key }))}
                                    className={`flex items-center gap-4 rounded-2xl border-2 p-5 text-left transition-all duration-200 ${answers[q.id] === key ? "border-neutral-900 bg-neutral-50 shadow-sm dark:border-neutral-100 dark:bg-neutral-900" : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/80 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-900"}`}
                                >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100 text-sm font-bold text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200">
                                        {key.toUpperCase()}
                                    </span>
                                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{q.options[key]}</span>
                                    {answers[q.id] === key && <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-neutral-900 dark:text-neutral-100" strokeWidth={2} />}
                                </button>
                            )
                        ))}
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between">
                <button
                    onClick={() => {
                        if (qIdx > 0) setQIdx((i) => i - 1);
                        else if (sectionIdx > 0) { setSectionIdx((i) => i - 1); setQIdx(sections[sectionIdx - 1].questions.length - 1); }
                    }}
                    disabled={sectionIdx === 0 && qIdx === 0}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border px-6 py-3 text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                >
                    <ArrowLeft size={18} /> Назад
                </button>
                {isLast ? (
                    <button
                        onClick={() => {
                            if (unansweredCount > 0) {
                                const ok = window.confirm(`Не отвечено вопросов: ${unansweredCount}. Завершить тест?`);
                                if (!ok) return;
                            }
                            handleSubmit();
                        }}
                        disabled={submitting}
                        className="inline-flex items-center gap-2 rounded-2xl bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                    >
                        {submitting ? "Проверка…" : "Завершить"}
                    </button>
                ) : (
                    <button
                        onClick={() => {
                            if (qIdx < section.questions.length - 1) setQIdx((i) => i + 1);
                            else if (sectionIdx < sections.length - 1) { setSectionIdx((i) => i + 1); setQIdx(0); }
                        }}
                        className="inline-flex items-center gap-2 rounded-2xl bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
                    >
                        Далее <ArrowLeft size={18} className="rotate-180" />
                    </button>
                )}
            </div>
        </div>
    );
}
