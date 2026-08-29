"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Clock, ArrowLeft, CheckCircle2, Trophy, Calendar, Timer } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/useToast";
import supabase from "@/lib/supabase/client";
import { pageCache } from "@/lib/page-cache";

type Question = {
    id: string;
    text: string;
    options: Record<string, string>;
    points: number;
    image_url?: string | null;
};

type Assignment = {
    id: string;
    test_id: string;
    test_title: string;
    status: "assigned" | "in_progress" | "completed";
    assigned_by: string;
    assigned_at: string;
    started_at?: string | null;
    completed_at?: string | null;
};

type PlacementResult = {
    resultId: string;
    score: number;
    total: number;
    percentage: number;
    completedAt: string;
    timeSpentSeconds: number;
    testTitle: string;
    userName: string;
    userSurname?: string;
    userPhone?: string;
    correctAnswers: number;
};

type AnswerState = Record<string, string>;

export default function PlacementTestPage() {
    const { id } = useParams();
    const router = useRouter();
    const { user } = useAuthStore();
    const toast = useToast();

    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [answers, setAnswers] = useState<AnswerState>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<PlacementResult | null>(null);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [timeLimitSeconds, setTimeLimitSeconds] = useState<number | null>(null);
    const [currentQ, setCurrentQ] = useState(0);
    const [passingScore, setPassingScore] = useState(0);
    const autoSubmittedRef = useRef(false);

    const handleSubmit = useCallback(async () => {
        if (!id || submitting || !assignment || result) return;
        setSubmitting(true);
        try {
            const timeSpent = timeLimitSeconds
                ? timeLimitSeconds - (timeLeft ?? 0)
                : 0;

            const { data, error } = await supabase.rpc("submit_placement", {
                p_assignment_id: id as string,
                p_answers: answers,
                p_time_spent_seconds: Math.max(0, timeSpent),
            });

            if (error) {
                toast.error("Ошибка отправки", { description: error.message });
                return;
            }

            if (data) {
                pageCache.invalidatePrefix("placementAssignments:");
                if (user) pageCache.invalidate(`hasPlacementResult:${user.id}`);
                setResult({
                    resultId: data.resultId,
                    score: data.score,
                    total: data.total,
                    percentage: data.percentage,
                    completedAt: new Date().toISOString(),
                    timeSpentSeconds: Math.max(0, timeSpent),
                    testTitle: assignment.test_title,
                    userName: user?.name || "",
                    userSurname: user?.surname || "",
                    userPhone: user?.phone || "",
                    correctAnswers: data.correctAnswers,
                });
                setAssignment((prev) => prev ? { ...prev, status: "completed" } : prev);
            }
        } catch (err) {
            toast.error("Ошибка отправки", { description: String(err) });
        } finally {
            setSubmitting(false);
        }
    }, [id, submitting, assignment, result, timeLimitSeconds, timeLeft, answers, toast, user]);

    const load = useCallback(async () => {
        if (!id || !user) return;
        setLoading(true);

        const { data: assignmentData, error: assignmentError } = await supabase
            .from("placement_assignments")
            .select("*")
            .eq("id", id as string)
            .single();

        if (assignmentError || !assignmentData || assignmentData.user_id !== user.id) {
            toast.error("Доступ запрещён", { description: "Это задание не принадлежит вашему аккаунту." });
            router.push("/placement");
            return;
        }

        const assignmentRow = assignmentData as Assignment;

        if (!["assigned", "in_progress", "completed"].includes(assignmentRow.status)) {
            toast.error("Тест недоступен", { description: "Это задание больше не активно." });
            router.push("/placement");
            return;
        }

        setAssignment(assignmentRow);

        const { data: testData } = await supabase
            .from("placement_tests")
            .select("passing_score, time_limit_minutes")
            .eq("id", assignmentRow.test_id)
            .single();

        const limitMinutes = testData?.time_limit_minutes ?? null;
        setPassingScore(testData?.passing_score || 0);

        if (assignmentRow.status === "completed") {
            const { data: resultData } = await supabase
                .from("placement_results")
                .select("*")
                .eq("assignment_id", id as string)
                .single();

            if (resultData) {
                setResult({
                    resultId: resultData.id,
                    score: resultData.score,
                    total: resultData.total_questions,
                    percentage: resultData.accuracy,
                    completedAt: resultData.completed_at,
                    timeSpentSeconds: resultData.time_spent_seconds,
                    testTitle: resultData.test_title,
                    userName: resultData.user_name,
                    userSurname: resultData.user_surname,
                    userPhone: resultData.user_phone,
                    correctAnswers: resultData.correct_answers,
                });
            }
            setLoading(false);
            return;
        }

        if (limitMinutes) {
            const totalSeconds = limitMinutes * 60;
            setTimeLimitSeconds(totalSeconds);

            if (assignmentRow.status === "in_progress" && assignmentRow.started_at) {
                const elapsed = Math.floor(
                    (Date.now() - new Date(assignmentRow.started_at).getTime()) / 1000
                );
                setTimeLeft(Math.max(0, totalSeconds - elapsed));
            } else {
                setTimeLeft(totalSeconds);
            }
        }

        if (assignmentRow.status === "assigned") {
            const { error: startError } = await supabase
                .from("placement_assignments")
                .update({ status: "in_progress", started_at: new Date().toISOString() })
                .eq("id", id as string)
                .eq("status", "assigned");

            if (!startError) {
                setAssignment((prev) =>
                    prev ? { ...prev, status: "in_progress", started_at: new Date().toISOString() } : prev
                );
            }
        }

        const { data: questionsData, error: questionsError } = await supabase.rpc("get_placement_questions", {
            p_test_id: assignmentRow.test_id,
        });

        if (questionsError) {
            toast.error("Ошибка загрузки вопросов", { description: questionsError.message });
        } else if (questionsData) {
            setQuestions(questionsData as Question[]);
        }

        setLoading(false);
    }, [id, user, router, toast]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (timeLeft === null || timeLeft <= 0 || result) return;
        const timer = setInterval(() => setTimeLeft((t) => (t !== null && t > 0 ? t - 1 : 0)), 1000);
        return () => clearInterval(timer);
    }, [timeLeft, result]);

    useEffect(() => {
        if (
            timeLeft === 0 &&
            questions.length > 0 &&
            !submitting &&
            !result &&
            !autoSubmittedRef.current
        ) {
            autoSubmittedRef.current = true;
            handleSubmit();
        }
    }, [timeLeft, questions.length, submitting, result, handleSubmit]);

    const fmtTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    const fmtDate = (d: string) => new Date(d).toLocaleString("ru-RU");

    const timeSpentStr = result ? fmtTime(result.timeSpentSeconds) : "";

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="h-10 w-28 animate-pulse rounded-3xl border border-border bg-muted" />
            </div>
        );
    }

    if (!assignment) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="max-w-md rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-sm">
                    <h2 className="mb-3 text-2xl font-bold text-foreground">Тест не найден</h2>
                    <p className="text-sm text-muted-foreground">Проверьте ссылку — задание не найдено или недоступно.</p>
                    <button
                        onClick={() => router.push("/placement")}
                        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                    >
                        <ArrowLeft size={18} /> К списку тестов
                    </button>
                </div>
            </div>
        );
    }

    if (result) {
        const passed = result.percentage >= passingScore;
        return (
            <div className="mx-auto flex max-w-2xl animate-in fade-in slide-in-from-bottom-4 flex-col gap-8 py-6 duration-700">
                <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${passed ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40" : "bg-red-100 text-red-600 dark:bg-red-950/30"}`}>
                            <Trophy size={24} />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                            {passed ? "Тест пройден!" : "Тест не пройден"}
                        </h1>
                    </div>

                    <p className="mt-2 text-sm text-muted-foreground">{result.testTitle}</p>

                    <p className={`mt-4 text-base font-medium ${passed ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
                        {passed
                            ? "Поздравляем! Вы успешно прошли вступительный тест. Результат сохранён — администратор увидит его в системе."
                            : passingScore > 0
                                ? `К сожалению, проходной балл (${passingScore}%) не достигнут. Свяжитесь с администратором для дальнейших шагов.`
                                : "Тест завершён. Результат сохранён — администратор увидит его в системе."}
                    </p>

                    <div className="mt-8">
                        <div className="text-6xl font-extrabold tabular-nums text-foreground">{result.percentage}%</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {result.correctAnswers} / {result.total} правильных ответов
                        </p>
                        {passingScore > 0 && (
                            <p className={`mt-1 text-xs font-semibold ${passed ? "text-emerald-600" : "text-red-600"}`}>
                                Проходной балл: {passingScore}% — {passed ? "пройдено" : "не пройдено"}
                            </p>
                        )}
                    </div>

                    <div className="mt-6 flex flex-col gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center justify-center gap-4">
                            <span className="inline-flex items-center gap-1"><Calendar size={12} /> {fmtDate(result.completedAt)}</span>
                            {result.timeSpentSeconds > 0 && (
                                <span className="inline-flex items-center gap-1"><Timer size={12} /> {timeSpentStr}</span>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={() => router.push("/placement")}
                        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
                    >
                        <ArrowLeft size={18} /> К списку тестов
                    </button>
                </div>
            </div>
        );
    }

    if (questions.length === 0) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="max-w-md rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-sm">
                    <h2 className="mb-3 text-2xl font-bold text-foreground">Вопросы не найдены</h2>
                    <p className="text-sm text-muted-foreground">В этом тесте пока нет вопросов. Обратитесь к администратору.</p>
                    <button
                        onClick={() => router.push("/placement")}
                        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                    >
                        <ArrowLeft size={18} /> К списку тестов
                    </button>
                </div>
            </div>
        );
    }

    const q = questions[currentQ];
    const isLast = currentQ === questions.length - 1;
    const unansweredCount = questions.filter((question) => !answers[question.id]).length;

    return (
        <div className="mx-auto flex max-w-2xl animate-in fade-in slide-in-from-bottom-4 flex-col gap-8 py-6 duration-700">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{assignment.test_title}</h1>
                    <p className="mt-1 text-xs text-muted-foreground">Вопрос {currentQ + 1} из {questions.length}</p>
                </div>
                {timeLeft !== null && (
                    <div className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold tabular-nums ${timeLeft < 60 ? "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40" : "border-border bg-muted text-foreground"}`}>
                        <Clock size={16} /> {fmtTime(timeLeft)}
                    </div>
                )}
            </div>

            <div className="h-2 rounded-full bg-muted overflow-hidden border border-border">
                <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }} />
            </div>

            {q && (
                <div className="rounded-3xl border border-border bg-card p-8 shadow-sm space-y-6">
                    {q.image_url && (
                        <Image src={q.image_url} alt="" width={600} height={320} className="max-h-72 w-auto rounded-2xl border border-border object-contain" />
                    )}
                    <p className="text-lg font-semibold text-foreground">{q.text}</p>
                    <div className="grid grid-cols-1 gap-3">
                        {["a", "b", "c", "d"].map((key) => {
                            const selected = answers[q.id] === key;
                            return q.options[key] && (
                                <button
                                    key={key}
                                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: key }))}
                                    className={`flex items-center gap-4 rounded-xl border p-5 text-left transition-all duration-200 ${selected ? "border-primary bg-[hsl(var(--brand-blue-soft))] ring-1 ring-primary" : "border-border bg-card hover:bg-muted/50"}`}
                                >
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                                        {key.toUpperCase()}
                                    </span>
                                    <span className="text-sm font-medium text-foreground">{q.options[key]}</span>
                                    {selected && <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-primary" strokeWidth={2} />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between">
                <button
                    onClick={() => setCurrentQ((c) => Math.max(0, c - 1))}
                    disabled={currentQ === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                >
                    <ArrowLeft size={18} /> Назад
                </button>
                {isLast ? (
                    <button
                        onClick={() => {
                            if (unansweredCount > 0) {
                                const ok = window.confirm(
                                    `Не отвечено вопросов: ${unansweredCount}. Завершить тест?`
                                );
                                if (!ok) return;
                            }
                            handleSubmit();
                        }}
                        disabled={submitting}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                    >
                        {submitting ? "Проверка…" : "Завершить"}
                    </button>
                ) : (
                    <button
                        onClick={() => setCurrentQ((c) => Math.min(questions.length - 1, c + 1))}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
                    >
                        Далее <ArrowLeft size={18} className="rotate-180" />
                    </button>
                )}
            </div>
        </div>
    );
}
