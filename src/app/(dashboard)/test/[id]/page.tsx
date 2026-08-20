"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Question, Topic, Medal } from "@/lib/firestore-schema";
import { fetchTopicById, fetchQuestionsByTopic, fetchTopicsByTextbook } from "@/lib/data-fetching";
import { useAuthStore } from "@/store/useAuthStore";
import { invalidateUserCache } from "@/lib/stats-utils";
import { useStatsStore } from "@/store/useStatsStore";
import { db, doc, setDoc, updateDoc, increment, serverTimestamp, collection, addDoc, getDoc, getDocs } from "@/lib/firebase";
import {
    CheckCircle2, XCircle, Check,
    Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Pause, Play, Eye, EyeOff,
    LayoutGrid, X, ArrowLeft, Info, Strikethrough, ChevronUp,
    MoreVertical, Maximize2, Minimize2,
} from "lucide-react";
import { getMedalByErrors } from "@/lib/constants";
import MathInput from "@/components/MathInput";
import MathText from "@/components/MathText";

/* ─── types ─────────────────────────────────────────── */
type QStatus = "unanswered" | "correct-first" | "correct-retry" | "incorrect";
interface QState { status: QStatus; marked: boolean; answer: string; }
function blank(n: number): QState[] {
    return Array.from({ length: n }, () => ({ status: "unanswered" as QStatus, marked: false, answer: "" }));
}
function fmt(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

async function requestElFullscreen(el: HTMLElement): Promise<void> {
    const anyEl = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
    if (el.requestFullscreen) {
        await el.requestFullscreen();
        return;
    }
    if (anyEl.webkitRequestFullscreen) await Promise.resolve(anyEl.webkitRequestFullscreen());
}

async function exitDocumentFullscreen(): Promise<void> {
    const anyDoc = document as Document & {
        webkitExitFullscreen?: () => Promise<void> | void;
        webkitFullscreenElement?: Element | null;
    };
    const inFs = document.fullscreenElement ?? anyDoc.webkitFullscreenElement;
    if (!inFs) return;
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (anyDoc.webkitExitFullscreen) await Promise.resolve(anyDoc.webkitExitFullscreen());
}

/* ─── page ───────────────────────────────────────────── */
export default function TestPage() {
    const { id } = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useAuthStore();
    const { reset: resetStats } = useStatsStore();

    // all selected topic IDs (multi-topic support via ?t=id1,id2,...)
    const allTopicIds = useMemo(() => {
        const t = searchParams.get("t");
        if (t) return t.split(",").filter(Boolean);
        return id ? [id as string] : [];
    }, [id, searchParams]);

    const [allTopics, setAllTopics] = useState<Topic[]>([]);
    const topic = allTopics[0] ?? null; // backward compat
    const [questions, setQuestions] = useState<Question[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Per-question state
    const [qStates, setQStates] = useState<QState[]>([]);
    const qStatesRef = useRef<QState[]>([]);
    useEffect(() => { qStatesRef.current = qStates; }, [qStates]);

    // Current question state
    const [idx, setIdx] = useState(0);
    const [answer, setAnswer] = useState("");
    const [checked, setChecked] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [showExplanation, setShowExplanation] = useState(false);

    // Cross-out: show letter circles beside options + per-question crossed keys
    const [showCrossOutColumn, setShowCrossOutColumn] = useState(false);
    const [crossedOut, setCrossedOut] = useState<Record<number, string[]>>({});

    // UI overlays
    const [showBank, setShowBank] = useState(false);
    const [showInfo, setShowInfo] = useState(false);

    // Timer
    const [secs, setSecs] = useState(0);
    const [paused, setPaused] = useState(false);
    const [timerVisible, setTimerVisible] = useState(true);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const progressRestoredRef = useRef(false);
    const wasAlreadyCompletedRef = useRef<Set<string>>(new Set());

    // Fullscreen + «Ещё» menu
    const testShellRef = useRef<HTMLDivElement>(null);
    const moreMenuWrapRef = useRef<HTMLDivElement>(null);
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const [fullscreenActive, setFullscreenActive] = useState(false);

    useEffect(() => {
        const sync = () => {
            const el = testShellRef.current;
            const fs =
                document.fullscreenElement ??
                (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement;
            setFullscreenActive(Boolean(el && fs === el));
        };
        sync();
        document.addEventListener("fullscreenchange", sync);
        document.addEventListener("webkitfullscreenchange", sync as EventListener);
        return () => {
            document.removeEventListener("fullscreenchange", sync);
            document.removeEventListener("webkitfullscreenchange", sync as EventListener);
        };
    }, []);

    useEffect(() => {
        if (!moreMenuOpen) return;
        const close = (e: MouseEvent) => {
            if (moreMenuWrapRef.current?.contains(e.target as Node)) return;
            setMoreMenuOpen(false);
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [moreMenuOpen]);

    const toggleTestFullscreen = useCallback(async () => {
        const el = testShellRef.current;
        if (!el) return;
        const fs =
            document.fullscreenElement ??
            (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement;
        try {
            if (fs === el) await exitDocumentFullscreen();
            else await requestElFullscreen(el);
        } catch {
            /* API может быть недоступен (iOS и т.д.) */
        }
        setMoreMenuOpen(false);
    }, []);

    /* ─ load ─ */
    const topicIdsKey = allTopicIds.join(",");
    useEffect(() => {
        if (!allTopicIds.length) return;
        progressRestoredRef.current = false;
        wasAlreadyCompletedRef.current = new Set();
        Promise.all([
            Promise.all(allTopicIds.map((tid) => fetchTopicById(tid))),
            Promise.all(allTopicIds.map((tid) => fetchQuestionsByTopic(tid))),
        ]).then(([topicResults, questionGroups]) => {
            const validTopics = topicResults.filter(Boolean) as Topic[];
            const allQs = questionGroups.flat();
            setAllTopics(validTopics);
            setQuestions(allQs);
            setQStates(blank(allQs.length));
            setIsLoading(false);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topicIdsKey]);

    /* ─ restore saved question statuses from Firestore (only colors for bank, no answers) ─ */
    useEffect(() => {
        if (!user || allTopics.length === 0 || questions.length === 0 || progressRestoredRef.current) return;
        progressRestoredRef.current = true;
        void Promise.all(
            allTopics.map((t) => getDoc(doc(db, "users", user.id, "userProgress", t.id)))
        ).then((snaps) => {
            const mergedStatuses: Record<string, { status: string; marked: boolean; answer: string }> = {};
            snaps.forEach((snap, i) => {
                if (!snap.exists()) return;
                const data = snap.data() as { completedAt?: string | null; questionStatuses?: Record<string, { status: string; marked: boolean; answer: string }> };
                if (data.completedAt) wasAlreadyCompletedRef.current.add(allTopics[i].id);
                if (data.questionStatuses) Object.assign(mergedStatuses, data.questionStatuses);
            });
            if (Object.keys(mergedStatuses).length === 0) return;
            const restored = questions.map((q) => {
                const s = mergedStatuses[q.id];
                return s
                    ? { status: s.status as QStatus, marked: Boolean(s.marked), answer: "" }
                    : { status: "unanswered" as QStatus, marked: false, answer: "" };
            });
            setQStates(restored);
            qStatesRef.current = restored;
        });
    }, [user, allTopics, questions]);

    /* ─ timer ─ */
    useEffect(() => {
        if (isLoading || paused) {
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }
        timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [paused, isLoading]);

    /* ─ beforeunload warning ─ */
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (qStatesRef.current.some((s) => s.status !== "unanswered")) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, []);

    /* ─ derived ─ */
    const q = questions[idx];
    const isText = q?.type === "text" || (!!q && !q.options?.a && !q.options?.b);
    const qState = qStates[idx] ?? { status: "unanswered", marked: false, answer: "" };
    const crossedForQ = crossedOut[idx] ?? [];

    const answeredCount = useMemo(() => qStates.filter((s) => s.status !== "unanswered").length, [qStates]);

    /* ─ navigate to question ─ */
    const goTo = useCallback((i: number) => {
        setIdx(i);
        setAnswer("");       // не восстанавливаем предыдущий ответ
        setChecked(false);   // не показываем предыдущий результат
        setAttempts(0);
        setShowExplanation(false);
        setShowBank(false);
        setShowInfo(false);
    }, []);

    /* ─ check answer (показывает фидбэк, не блокирует варианты) ─ */
    const handleCheck = useCallback(() => {
        if (!q || checked || !answer.trim()) return;
        setAttempts((v) => v + 1);
        setChecked(true);
    }, [q, checked, answer]);

    /* ─ toggle mark ─ */
    const toggleMark = useCallback(() => {
        setQStates((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], marked: !next[idx].marked };
            return next;
        });
    }, [idx]);

    const toggleCrossOutOption = useCallback((key: string) => {
        setCrossedOut((prev) => {
            const cur = prev[idx] ?? [];
            const set = new Set(cur);
            if (set.has(key)) set.delete(key);
            else set.add(key);
            return { ...prev, [idx]: Array.from(set) };
        });
    }, [idx]);


    /* ─ helper: partition states by topicId and build per-topic payloads ─ */
    const buildTopicPayloads = useCallback((states: QState[]) => {
        type Payload = {
            topicId: string;
            questionStatuses: Record<string, { status: QStatus; marked: boolean; answer: string }>;
            corrFirst: number; corrRetry: number; corr: number;
            errs: number; markedCount: number; accuracy: number;
            medal: Medal;
        };
        const map = new Map<string, Payload>();
        questions.forEach((q, i) => {
            if (!map.has(q.topicId)) {
                map.set(q.topicId, {
                    topicId: q.topicId, questionStatuses: {},
                    corrFirst: 0, corrRetry: 0, corr: 0, errs: 0, markedCount: 0, accuracy: 0,
                    medal: "none" as Medal,
                });
            }
            const p = map.get(q.topicId)!;
            p.questionStatuses[q.id] = { status: states[i].status, marked: states[i].marked, answer: states[i].answer };
            if (states[i].status === "correct-first") p.corrFirst++;
            else if (states[i].status === "correct-retry") p.corrRetry++;
            else if (states[i].status === "incorrect") p.errs++;
            if (states[i].marked) p.markedCount++;
        });
        map.forEach((p) => {
            const total = Object.keys(p.questionStatuses).length;
            p.corr = p.corrFirst + p.corrRetry;
            p.accuracy = total > 0 ? Math.round((p.corr / total) * 100) : 0;
            p.medal = getMedalByErrors(p.errs, 1);
        });
        return map;
    }, [questions]);

    /* ─ finish — сохраняет результат и редиректит в темы ─ */
    const handleFinish = useCallback(async (statesSnapshot?: QState[]) => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (!user || allTopics.length === 0) { router.push("/"); return; }
        setIsSaving(true);
        setSaveError(null);

        const states = statesSnapshot ?? qStatesRef.current;
        const payloads = buildTopicPayloads(states);

        // overall stats for testResults record
        const totalCorr = states.filter((s) => s.status === "correct-first" || s.status === "correct-retry").length;
        const totalErrs = states.filter((s) => s.status === "incorrect").length;
        const totalAcc = questions.length > 0 ? Math.round((totalCorr / questions.length) * 100) : 0;
        const totalMedal = getMedalByErrors(totalErrs, 1);

        invalidateUserCache(user.id);
        resetStats();

        let navSubjectId: string | null = null;
        try {
            // Save progress per topic
            await Promise.all(Array.from(payloads.values()).map((p) => {
                if (wasAlreadyCompletedRef.current.has(p.topicId)) {
                    return setDoc(doc(db, "users", user.id, "userProgress", p.topicId), { questionStatuses: p.questionStatuses }, { merge: true });
                }
                return setDoc(doc(db, "users", user.id, "userProgress", p.topicId), {
                    userId: user.id, topicId: p.topicId,
                    solvedQuestions: p.corr, correctFirstCount: p.corrFirst, correctRetryCount: p.corrRetry,
                    errors: p.errs, markedQuestions: p.markedCount, medal: p.medal, accuracy: p.accuracy,
                    completedAt: new Date().toISOString(),
                    questionStatuses: p.questionStatuses,
                });
            }));

            // testResults record (one per session, use first topic)
            await addDoc(collection(db, "users", user.id, "testResults"), {
                topicId: allTopics[0].id, correctAnswers: totalCorr, errors: totalErrs,
                accuracy: totalAcc, medal: totalMedal,
                timeSpentSeconds: secs, completedAt: serverTimestamp(),
            });

            // Stars + badges per unique textbook
            const textbookIds = Array.from(new Set(allTopics.map((t) => t.textbookId).filter((id): id is string => Boolean(id))));
            for (const tbId of textbookIds) {
                const tbSnap = await getDoc(doc(db, "textbooks", tbId));
                if (!tbSnap.exists()) continue;
                const { subjectId } = tbSnap.data();
                navSubjectId = subjectId as string;
                const rRef = doc(db, "users", user.id, "ratings", subjectId);
                const rSnap = await getDoc(rRef);
                // stars: sum of correct answers for topics in this textbook
                const tbCorr = allTopics
                    .filter((t) => t.textbookId === tbId)
                    .reduce((sum, t) => sum + (payloads.get(t.id)?.corr ?? 0), 0);
                if (rSnap.exists()) await updateDoc(rRef, { stars: increment(tbCorr), lastUpdated: serverTimestamp() });
                else await setDoc(rRef, { userId: user.id, subjectId, stars: tbCorr, lastUpdated: serverTimestamp() });

                const tbTopics = await fetchTopicsByTextbook(tbId);
                const pSnap = await getDocs(collection(db, "users", user.id, "userProgress"));
                const pMap: Record<string, string> = {};
                pSnap.forEach((d) => { pMap[d.id] = (d.data() as { medal: string }).medal; });
                const allGreen = tbTopics.every((t) => {
                    const p = payloads.get(t.id);
                    return (p ? p.medal : pMap[t.id]) === "green";
                });
                if (allGreen && tbTopics.length > 0) {
                    const bRef = doc(db, "users", user.id, "badges", tbId);
                    if (!(await getDoc(bRef)).exists()) {
                        await setDoc(bRef, {
                            name: `Знаток: ${tbSnap.data().title}`,
                            description: "Вы прошли все темы учебника на идеальный результат",
                            textbookId: tbId, icon: "🏆", unlockedAt: serverTimestamp(),
                        });
                    }
                }
            }
        } catch {
            setSaveError("Не удалось сохранить результат. Проверьте соединение и попробуйте снова.");
            setIsSaving(false);
            return;
        }
        setIsSaving(false);
        router.push(navSubjectId ? `/subject/${navSubjectId}` : "/");
    }, [user, allTopics, questions, secs, resetStats, router, buildTopicPayloads]);

    /* ─ save partial — сохраняет прогресс без завершения ─ */
    const handleSavePartial = useCallback(async () => {
        if (!user || allTopics.length === 0) return;
        const states = qStatesRef.current;
        const hasAnyAnswer = states.some((s) => s.status !== "unanswered");
        if (!hasAnyAnswer) return;

        const payloads = buildTopicPayloads(states);
        try {
            await Promise.all(Array.from(payloads.values()).map((p) => {
                if (wasAlreadyCompletedRef.current.has(p.topicId)) {
                    return setDoc(doc(db, "users", user.id, "userProgress", p.topicId), { questionStatuses: p.questionStatuses }, { merge: true });
                }
                return setDoc(doc(db, "users", user.id, "userProgress", p.topicId), {
                    userId: user.id, topicId: p.topicId,
                    solvedQuestions: p.corr, correctFirstCount: p.corrFirst, correctRetryCount: p.corrRetry,
                    errors: p.errs, markedQuestions: p.markedCount,
                    medal: "none", accuracy: 0, completedAt: null,
                    questionStatuses: p.questionStatuses,
                }, { merge: true });
            }));
        } catch { /* silent on back — user is leaving */ }
    }, [user, allTopics, buildTopicPayloads]);

    /* ─ save + next (сохраняет ответ и переходит дальше) ─ */
    const handleSaveAndNext = useCallback(() => {
        let merged = qStatesRef.current;
        if (answer.trim() && q) {
            const isCorrect = isText
                ? answer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase()
                : answer === q.correctAnswer;
            const status: QStatus = isCorrect
                ? (attempts <= 1 ? "correct-first" : "correct-retry")
                : "incorrect";
            merged = [...qStatesRef.current];
            merged[idx] = { ...merged[idx], status, answer };
            qStatesRef.current = merged;
            setQStates(merged);
        }
        if (idx < questions.length - 1) goTo(idx + 1);
        else void handleFinish(merged);
    }, [answer, attempts, isText, q, idx, questions.length, goTo, handleFinish]);

    /* ─ question bank order ─ */
    const bankOrder = useMemo(() => questions.map((_, i) => i), [questions]);

    /* ══════════════════════════════════ LOADING ════════════════════════════════ */
    if (isLoading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-[hsl(var(--brand-blue))] border-t-transparent animate-spin" />
                <p className="text-sm text-muted-foreground font-medium">Загрузка теста…</p>
            </div>
        </div>
    );

    if (!topic || questions.length === 0) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <p className="text-muted-foreground">Вопросы не найдены</p>
        </div>
    );

    /* ══════════════════════════════════ TEST ════════════════════════════════════ */
    return (
        <div
            ref={testShellRef}
            className={`relative flex flex-col bg-background ${
                fullscreenActive ? "h-screen overflow-hidden" : "h-dvh"
            }`}
        >

            {/* ─── TOP BAR ─── */}
            <div className="sticky top-0 z-30 shrink-0 bg-background/95 backdrop-blur border-b border-border">
                <div className="flex items-center justify-between px-4 py-3 gap-4">
                    {/* Left: back + topic */}
                    <div className="flex items-center gap-3 min-w-0">
                        <button type="button" onClick={async () => { await handleSavePartial(); router.back(); }}
                            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors shrink-0">
                            <ArrowLeft className="w-4 h-4" />
                            <span className="hidden sm:inline">Назад</span>
                        </button>
                        <span className="text-border hidden sm:block">|</span>
                        <span className="text-sm font-medium text-muted-foreground truncate hidden sm:block">
                            {allTopics.length > 1 ? `${allTopics.length} темы` : topic?.title ?? ""}
                        </span>
                    </div>

                    {/* Center: timer */}
                    <div className="flex items-center gap-2 shrink-0">
                        {timerVisible ? (
                            <span className="text-lg font-bold tabular-nums text-foreground min-w-[4rem] text-center">{fmt(secs)}</span>
                        ) : (
                            <span className="text-sm text-muted-foreground font-medium">••:••</span>
                        )}
                        <button type="button" onClick={() => setPaused((v) => !v)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors"
                            title={paused ? "Продолжить" : "Пауза"}>
                            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                        </button>
                        <button type="button" onClick={() => setTimerVisible((v) => !v)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors"
                            title={timerVisible ? "Скрыть время" : "Показать время"}>
                            {timerVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                    </div>

                    {/* Right: counter + Ещё */}
                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                        <span className="px-3 py-1.5 rounded-xl bg-foreground text-background text-sm font-bold tabular-nums">
                            {idx + 1} / {questions.length}
                        </span>
                        <div ref={moreMenuWrapRef} className="relative hidden sm:block">
                            <button
                                type="button"
                                onClick={() => setMoreMenuOpen((v) => !v)}
                                className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 min-w-[2.75rem] transition-colors ${
                                    moreMenuOpen
                                        ? "bg-[hsl(var(--brand-blue-soft))] text-[hsl(var(--brand-blue))]"
                                        : "text-[hsl(var(--brand-blue))] hover:bg-[hsl(var(--brand-blue-soft))]/60"
                                }`}
                                aria-expanded={moreMenuOpen}
                                aria-haspopup="menu"
                            >
                                <MoreVertical className="h-5 w-5" strokeWidth={2} />
                                <span className="text-[11px] font-semibold leading-none">Ещё</span>
                            </button>
                            {moreMenuOpen && (
                                <div
                                    role="menu"
                                    className="absolute right-0 top-full z-[60] mt-1.5 w-56 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-xl ring-1 ring-black/5 dark:ring-white/10"
                                >
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => void toggleTestFullscreen()}
                                        className="hidden sm:flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
                                    >
                                        {fullscreenActive ? (
                                            <>
                                                <Minimize2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                Выйти из полноэкранного
                                            </>
                                        ) : (
                                            <>
                                                <Maximize2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                На весь экран
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="h-1 bg-muted">
                    <div
                        className="h-full bg-[hsl(var(--brand-blue))] transition-all duration-300"
                        style={{ width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%` }}
                    />
                </div>
            </div>

            {/* ─── MAIN CONTENT ─── */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
                <div className="max-w-2xl mx-auto px-4 py-6">

                    {/* Question header */}
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background text-sm font-bold shrink-0">
                                {idx + 1}
                            </span>
                            <button
                                type="button"
                                onClick={toggleMark}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                                    qState.marked
                                        ? "border-amber-400 bg-amber-50 text-amber-700"
                                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                                }`}
                            >
                                {qState.marked
                                    ? <BookmarkCheck className="w-3.5 h-3.5" />
                                    : <Bookmark className="w-3.5 h-3.5" />
                                }
                                {qState.marked ? "Отмечен" : "Отметить"}
                            </button>
                        </div>

                        <div className="relative">
                            <button type="button" onClick={() => setShowInfo((v) => !v)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors">
                                <Info className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                            {showInfo && (
                                <div className="absolute right-0 top-10 z-50 w-64 rounded-2xl border border-border bg-card shadow-xl p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-bold text-foreground">Информация</span>
                                        <button type="button" onClick={() => setShowInfo(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <div className="text-xs text-muted-foreground mb-0.5">Сложность</div>
                                            <div className="font-semibold capitalize">
                                                {q?.difficulty === "easy" ? "Лёгкий" : q?.difficulty === "medium" ? "Средний" : "Сложный"}
                                            </div>
                                        </div>
                                        {q?.domain && <div>
                                            <div className="text-xs text-muted-foreground mb-0.5">Раздел</div>
                                            <div className="font-semibold">{q.domain}</div>
                                        </div>}
                                        {q?.skill && <div className="col-span-2">
                                            <div className="text-xs text-muted-foreground mb-0.5">Навык</div>
                                            <div className="font-semibold">{q.skill}</div>
                                        </div>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Difficulty badge */}
                    {q?.difficulty && (
                        <div className="mb-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                q.difficulty === "easy" ? "bg-emerald-100 text-emerald-700"
                                : q.difficulty === "medium" ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                            }`}>
                                {q.difficulty === "easy" ? "Лёгкий" : q.difficulty === "medium" ? "Средний" : "Сложный"}
                            </span>
                        </div>
                    )}

                    {/* Question image */}
                    {q?.imageUrl && (
                        <div className="relative mb-5 max-h-64 w-full rounded-xl overflow-hidden border border-border bg-muted/30">
                            <Image
                                src={q.imageUrl}
                                alt=""
                                width={800}
                                height={256}
                                className="w-full max-h-64 object-contain"
                            />
                        </div>
                    )}

                    {/* Question text */}
                    <MathText
                        content={q?.text ?? ""}
                        className="text-lg font-medium text-foreground leading-relaxed mb-6 ql-content math-question-text"
                    />

                    {/* ─── TEXT INPUT (for English writing etc.) ─── */}
                    {isText ? (
                        <div className="space-y-3">
                             <MathInput
                                value={answer}
                                onChange={(v) => { setAnswer(v); setChecked(false); }}
                                className={`w-full min-h-[120px] ${
                                    checked
                                        ? answer.trim().toLowerCase() === q?.correctAnswer?.trim().toLowerCase()
                                            ? "border-emerald-400"
                                            : "border-red-400"
                                        : ""
                                }`}
                            />
                            {checked && answer.trim().toLowerCase() !== q?.correctAnswer?.trim().toLowerCase() && (
                                <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4">
                                    <div className="text-xs font-bold text-emerald-700 mb-1">Правильный ответ:</div>
                                    <div className="text-base font-medium text-gray-900">{q?.correctAnswer}</div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* ─── MULTIPLE CHOICE ─── */
                        <div>
                            <div className="flex justify-end mb-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCrossOutColumn((v) => !v)}
                                    title={showCrossOutColumn ? "Скрыть круги зачёркивания" : "Показать круги — нажмите букву, чтобы зачеркнуть вариант"}
                                    className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                                        showCrossOutColumn
                                            ? "border-zinc-400 bg-zinc-200 text-zinc-800 shadow-sm"
                                            : "border-border bg-card text-muted-foreground hover:bg-muted"
                                    }`}
                                >
                                    <Strikethrough className="w-4 h-4" />
                                </button>
                            </div>
                            <div
                                className={`grid gap-x-2 gap-y-3 ${showCrossOutColumn ? "grid-cols-[1fr_2.75rem]" : "grid-cols-1"}`}
                            >
                                {Object.entries(q?.options ?? {}).map(([key, val]) => {
                                    const isSelected = answer === key;
                                    const isCorrectOpt = key === q?.correctAnswer;
                                    const isCrossed = crossedForQ.includes(key);

                                    let cls = "border-2 border-border bg-card hover:border-muted-foreground/50 hover:bg-muted/50 cursor-pointer";
                                    if (checked) {
                                        if (isSelected && isCorrectOpt) cls = "border-2 border-emerald-400 bg-emerald-50";
                                        else if (isSelected && !isCorrectOpt) cls = "border-2 border-red-400 bg-red-50";
                                        else cls = "border-2 border-border bg-card hover:border-muted-foreground/50 hover:bg-muted/50 cursor-pointer";
                                    } else if (isSelected && !isCrossed) {
                                        cls = "border-2 border-[hsl(var(--brand-blue))] bg-[hsl(var(--brand-blue-soft))]";
                                    }
                                    const letterCls = checked && isSelected && isCorrectOpt
                                        ? "bg-emerald-500 border-emerald-400 text-white"
                                        : checked && isSelected && !isCorrectOpt
                                        ? "bg-red-500 border-red-400 text-white"
                                        : isSelected && !checked
                                        ? "bg-[hsl(var(--brand-blue))] border-[hsl(var(--brand-blue))] text-white"
                                        : "border-border text-muted-foreground";

                                    const railLetterCls = checked && isSelected && isCorrectOpt
                                        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                                        : checked && isSelected && !isCorrectOpt
                                        ? "border-red-500 bg-red-50 text-red-800"
                                        : isCrossed
                                        ? "border-foreground bg-background text-foreground"
                                        : isSelected && !checked
                                        ? "border-[hsl(var(--brand-blue))] bg-[hsl(var(--brand-blue-soft))] text-[hsl(var(--brand-blue))]"
                                        : "border-foreground bg-background text-foreground";

                                    return (
                                        <Fragment key={key}>
                                            <button
                                                type="button"
                                                onClick={() => { setAnswer(key); setChecked(false); }}
                                                className={`relative flex min-w-0 items-center gap-4 rounded-2xl p-4 text-left transition-all duration-200 ${cls}`}
                                            >
                                                {isCrossed && (
                                                    <span
                                                        className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center px-4 sm:px-6"
                                                        aria-hidden
                                                    >
                                                        <span className="h-0.5 w-full max-w-full rounded-full bg-neutral-700/85" />
                                                    </span>
                                                )}
                                                {!showCrossOutColumn && (
                                                    <span
                                                        className={`relative z-[2] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${letterCls}`}
                                                    >
                                                        {key.toUpperCase()}
                                                    </span>
                                                )}
                                                 <span className="relative z-[2] min-w-0 flex-1 text-base font-medium text-foreground">
                                                    <MathText content={val} as="span" />
                                                </span>
                                                {checked && isSelected && isCorrectOpt && (
                                                    <CheckCircle2 className="relative z-[2] h-5 w-5 shrink-0 text-emerald-500" />
                                                )}
                                                {checked && isSelected && !isCorrectOpt && (
                                                    <XCircle className="relative z-[2] h-5 w-5 shrink-0 text-red-500" />
                                                )}
                                            </button>
                                            {showCrossOutColumn && (
                                                <div className="flex items-center justify-center self-center">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            toggleCrossOutOption(key);
                                                        }}
                                                        title={isCrossed ? "Снять зачёркивание" : "Зачеркнуть вариант"}
                                                        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-serif text-sm font-bold transition-colors hover:opacity-90 ${railLetterCls}`}
                                                    >
                                                        {isCrossed && (
                                                            <span
                                                                className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center px-0.5"
                                                                aria-hidden
                                                            >
                                                                <span className="h-[2px] w-[calc(100%+4px)] rounded-full bg-foreground/90" />
                                                            </span>
                                                        )}
                                                        <span className="relative z-[2]">{key.toUpperCase()}</span>
                                                    </button>
                                                </div>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ─── EXPLANATION (after check) ─── */}
                    {checked && q?.explanation && (
                        <div className="mt-4">
                            <button type="button" onClick={() => setShowExplanation((v) => !v)}
                                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-[hsl(var(--brand-blue))]/30 bg-[hsl(var(--brand-blue-soft))] text-[hsl(var(--brand-blue))] text-sm font-semibold hover:opacity-90 transition-all">
                                <span>Объяснение</span>
                                <ChevronRight className={`w-4 h-4 transition-transform ${showExplanation ? "rotate-90" : ""}`} />
                            </button>
                            {showExplanation && (
                                <div className="mt-2 px-4 py-4 rounded-xl bg-[hsl(var(--brand-blue-soft))]/50 border border-[hsl(var(--brand-blue))]/20 text-sm text-foreground leading-relaxed">
                                    {q.explanation}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Result feedback pill */}
                    {checked && answer && (() => {
                        const isCorrect = isText
                            ? answer.trim().toLowerCase() === q?.correctAnswer?.trim().toLowerCase()
                            : answer === q?.correctAnswer;
                        return (
                            <div className={`mt-4 flex items-center gap-2 px-4 py-3 rounded-xl ${
                                isCorrect ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                          : "bg-red-100 text-red-800 border border-red-200"
                            }`}>
                                {isCorrect
                                    ? <><CheckCircle2 className="w-5 h-5 shrink-0" /><span className="text-sm font-semibold">Правильно!</span></>
                                    : <><XCircle className="w-5 h-5 shrink-0" /><span className="text-sm font-semibold">Неверно. {!isText && `Правильный ответ: ${q?.correctAnswer?.toUpperCase()}`}</span></>
                                }
                            </div>
                        );
                    })()}

                    {/* Extra padding for bottom bar */}
                    <div className="h-24" />
                </div>
            </div>

            {/* ─── QUESTION BANK (tooltip слева в зоне контента, над нижней панелью) ─── */}
            {showBank && (
                <>
                    <button
                        type="button"
                        aria-label="Закрыть банк вопросов"
                        className="fixed inset-0 z-[44] bg-black/25"
                        onClick={() => setShowBank(false)}
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="question-bank-title"
                        className="fixed z-[50] flex w-[min(21rem,calc(100vw-1.5rem))] max-h-[min(72vh,calc(100dvh-6.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl ring-1 ring-black/5 dark:ring-white/10 left-3 bottom-[4.75rem] sm:left-4 sm:bottom-[5.5rem]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                            <span id="question-bank-title" className="text-sm font-bold text-foreground">
                                Банк вопросов
                            </span>
                            <button
                                type="button"
                                onClick={() => setShowBank(false)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 border-b border-border px-4 py-2.5 text-[11px] font-semibold text-muted-foreground sm:gap-3 sm:text-xs">
                            <span className="flex items-center gap-1.5">
                                <span className="h-3.5 w-3.5 rounded-sm bg-emerald-400 sm:h-4 sm:w-4 sm:rounded-md" />
                                С первого раза
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="h-3.5 w-3.5 rounded-sm bg-orange-400 sm:h-4 sm:w-4 sm:rounded-md" />
                                После попыток
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="h-3.5 w-3.5 rounded-sm bg-red-400 sm:h-4 sm:w-4 sm:rounded-md" />
                                Ошибка
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Bookmark className="h-3.5 w-3.5 text-amber-500 fill-amber-400 sm:h-4 sm:w-4" />
                                Отмечен
                            </span>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                            <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
                                {bankOrder.map((qi) => {
                                    const s = qStates[qi];
                                    const isCurrent = qi === idx;
                                    const diff = questions[qi]?.difficulty;
                                    const diffBg = diff === "easy"
                                        ? "bg-emerald-100 dark:bg-emerald-900/50"
                                        : diff === "medium"
                                          ? "bg-amber-100 dark:bg-amber-900/50"
                                          : diff === "hard"
                                            ? "bg-red-100 dark:bg-red-900/50"
                                            : "bg-muted";
                                    return (
                                        <button
                                            key={qi}
                                            type="button"
                                            onClick={() => goTo(qi)}
                                            className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold border-2 transition-all sm:h-10 sm:w-10 sm:rounded-xl sm:text-sm ${diffBg} text-foreground ${
                                                isCurrent
                                                    ? "border-foreground shadow-md"
                                                    : "border-transparent hover:opacity-75"
                                            }`}
                                        >
                                            {qi + 1}
                                            {/* Bookmark — top-left */}
                                            {s?.marked && (
                                                <span className="absolute -left-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full border border-white bg-amber-400 sm:-left-1 sm:-top-1 sm:h-3 sm:w-3">
                                                    <Bookmark className="h-1 w-1 fill-white text-white sm:h-1.5 sm:w-1.5" />
                                                </span>
                                            )}
                                            {/* Status — top-right */}
                                            {s?.status === "correct-first" && (
                                                <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full border border-white bg-emerald-500 sm:-right-1 sm:-top-1 sm:h-3 sm:w-3">
                                                    <Check className="h-1.5 w-1.5 text-white sm:h-2 sm:w-2" strokeWidth={3} />
                                                </span>
                                            )}
                                            {s?.status === "correct-retry" && (
                                                <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full border border-white bg-orange-400 sm:-right-1 sm:-top-1 sm:h-3 sm:w-3">
                                                    <Check className="h-1.5 w-1.5 text-white sm:h-2 sm:w-2" strokeWidth={3} />
                                                </span>
                                            )}
                                            {s?.status === "incorrect" && (
                                                <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full border border-white bg-red-500 sm:-right-1 sm:-top-1 sm:h-3 sm:w-3">
                                                    <X className="h-1.5 w-1.5 text-white sm:h-2 sm:w-2" strokeWidth={3} />
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ─── SAVE ERROR BANNER ─── */}
            {saveError && (
                <div className="shrink-0 bg-red-50 dark:bg-red-950/40 border-t border-red-200 dark:border-red-800 px-4 py-2.5 flex items-center gap-3">
                    <span className="text-sm font-medium text-red-700 dark:text-red-300 flex-1">{saveError}</span>
                    <button
                        type="button"
                        onClick={() => { setSaveError(null); void handleSaveAndNext(); }}
                        className="text-xs font-bold text-red-700 dark:text-red-300 underline shrink-0"
                    >Повторить</button>
                    <button type="button" onClick={() => setSaveError(null)} className="shrink-0">
                        <X className="h-4 w-4 text-red-500" />
                    </button>
                </div>
            )}

            {/* ─── BOTTOM BAR ─── */}
            <div className="sticky bottom-0 z-20 shrink-0 bg-background/95 backdrop-blur border-t border-border">
                {/* Строка 1 (мобайл): Банк вопросов на всю ширину */}
                <div className="flex items-center gap-2 px-3 pt-2 sm:hidden">
                    <button
                        type="button"
                        onClick={() => setShowBank((v) => !v)}
                        className={`flex flex-1 items-center justify-center gap-2 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                            showBank
                                ? "border-[hsl(var(--brand-blue))] bg-[hsl(var(--brand-blue-soft))] text-[hsl(var(--brand-blue))]"
                                : "border-border bg-card text-foreground"
                        }`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                        Банк вопросов
                        <span className="text-xs text-muted-foreground tabular-nums">{answeredCount}/{questions.length}</span>
                        {showBank ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 rotate-90 text-muted-foreground" />}
                    </button>
                </div>

                {/* Строка 2 (мобайл): Назад | Проверить | Следующий/Завершить */}
                <div className="flex items-center gap-2 px-3 py-2 sm:hidden">
                    <button type="button" onClick={() => idx > 0 && goTo(idx - 1)} disabled={idx === 0}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card disabled:opacity-40">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={handleCheck}
                        disabled={!answer.trim() || checked}
                        className="flex-1 py-2.5 rounded-xl bg-[hsl(var(--brand-blue))] text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                    >
                        Проверить
                    </button>
                    {idx < questions.length - 1 ? (
                        <button type="button" onClick={handleSaveAndNext}
                            className="flex flex-1 items-center justify-center gap-1 py-2.5 rounded-xl bg-foreground text-background text-sm font-bold active:scale-[0.98] transition-all">
                            Далее<ChevronRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button type="button" onClick={handleSaveAndNext} disabled={isSaving}
                            className="flex flex-1 items-center justify-center gap-1 py-2.5 rounded-xl bg-foreground text-background text-sm font-bold disabled:opacity-60 active:scale-[0.98] transition-all">
                            {isSaving ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />…</> : <>Перейти в темы<ChevronRight className="w-4 h-4" /></>}
                        </button>
                    )}
                </div>

                {/* Десктоп: одна строка */}
                <div className="hidden sm:flex items-center justify-between px-4 py-3 gap-3">
                    <button
                        type="button"
                        onClick={() => setShowBank((v) => !v)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors shrink-0 ${
                            showBank
                                ? "border-[hsl(var(--brand-blue))] bg-[hsl(var(--brand-blue-soft))] text-[hsl(var(--brand-blue))]"
                                : "border-border bg-card text-foreground hover:bg-muted"
                        }`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                        Банк вопросов
                        <span className="text-xs text-muted-foreground tabular-nums">{answeredCount}/{questions.length}</span>
                        {showBank ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 rotate-90 text-muted-foreground" />}
                    </button>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => idx > 0 && goTo(idx - 1)} disabled={idx === 0}
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card hover:bg-muted transition-colors disabled:opacity-40">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={handleCheck}
                            disabled={!answer.trim() || checked}
                            className="px-5 py-2.5 rounded-xl bg-[hsl(var(--brand-blue))] text-white text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Проверить
                        </button>
                        {idx < questions.length - 1 ? (
                            <button type="button" onClick={handleSaveAndNext}
                                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-foreground text-background text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all">
                                Следующий<ChevronRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <button type="button" onClick={handleSaveAndNext} disabled={isSaving}
                                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-foreground text-background text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60">
                                {isSaving ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Сохранение…</> : <>Перейти в темы<ChevronRight className="w-4 h-4" /></>}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
