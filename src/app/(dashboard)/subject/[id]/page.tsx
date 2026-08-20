"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Subject, Topic, UserProgress } from "@/lib/firestore-schema";
import { fetchTextbooksBySubject, fetchSubjectById, fetchTopicsByTextbook, fetchTopicsBySubject } from "@/lib/data-fetching";
import { useAuthStore } from "@/store/useAuthStore";
import { db, collection, getDocs, query, where } from "@/lib/firebase";
import {
    ChevronRight,
    Filter,
    ChevronDown,
    Check,
    Bookmark,
    BookmarkCheck,
    Trophy,
} from "lucide-react";

type Medal = "none" | "green" | "grey" | "bronze";

function medalColor(medal: Medal): string {
    if (medal === "green") return "text-emerald-500";
    if (medal === "grey") return "text-slate-400 dark:text-slate-500";
    if (medal === "bronze") return "text-amber-500";
    return "";
}

function accuracyColor(accuracy: number): string {
    if (accuracy >= 80) return "text-emerald-600 dark:text-emerald-400";
    if (accuracy >= 50) return "text-amber-600 dark:text-amber-400";
    return "text-red-500 dark:text-red-400";
}

function TopicProgressStats({ prog }: { prog: UserProgress | undefined }) {
    if (!prog) return null;
    const total = prog.solvedQuestions ?? 0;
    const marked = prog.markedQuestions ?? 0;
    const hasCompleted = Boolean(prog.completedAt || prog.medal);
    if (!hasCompleted && total === 0 && marked === 0) return null;

    const hasNewFields = prog.correctFirstCount !== undefined || prog.correctRetryCount !== undefined;
    const correctFirst = hasNewFields ? (prog.correctFirstCount ?? 0) : total;

    return (
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <span
                className={`inline-flex items-center gap-1 ${correctFirst > 0 ? "text-emerald-600" : "text-muted-foreground"}`}
                title="Верно с первой попытки"
            >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full shadow-sm ${
                    correctFirst > 0 ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                }`}>
                    <Check className="h-3 w-3 stroke-[3]" aria-hidden />
                </span>
                <span className="text-sm font-semibold tabular-nums">{correctFirst}</span>
            </span>
            {marked > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-600" title="Отмечено в тесте">
                    <Bookmark className="h-4 w-4 shrink-0 fill-amber-400 text-amber-600" aria-hidden />
                    <span className="text-sm font-semibold tabular-nums">{marked}</span>
                </span>
            )}
        </div>
    );
}

type TopicGroup = {
    textbookId: string | null;
    textbookTitle: string;
    topics: Topic[];
};

type DiffFilter = "all" | "easy" | "medium" | "hard";
type SavedFilter = "all" | "saved" | "not_marked";
type CompletedFilter = "all" | "solved" | "unsolved";
type AnswerFilter = "all" | "incorrect" | "correct";

/* ─── helpers ────────────────────────────────────────────── */


function TopicCheckbox({
    checked,
    onChange,
    disabled,
    stopPropagation,
}: {
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
    stopPropagation?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={(e) => {
                if (stopPropagation) e.stopPropagation();
                onChange();
            }}
            disabled={disabled}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                checked ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-muted-foreground/40"
            } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
        >
            {checked ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
        </button>
    );
}

function FilterButton<T extends string>({
    icon,
    label,
    value,
    options,
    onChange,
}: {
    icon?: React.ReactNode;
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const isActive = value !== "all";
    const activeLabel = options.find((o) => o.value === value)?.label;

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-sm font-semibold transition-colors duration-200 ${
                    isActive
                        ? "border-[hsl(var(--brand-blue))] bg-[hsl(var(--brand-blue-soft))] text-[hsl(var(--brand-blue))]"
                        : "border-border bg-card text-foreground hover:bg-muted"
                }`}
            >
                {icon && <span className="text-muted-foreground">{icon}</span>}
                {label}
                {isActive && (
                    <span className="text-xs font-medium text-[hsl(var(--brand-blue))]/80">· {activeLabel}</span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 ml-0.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="absolute left-0 top-full mt-2 z-50 w-52 rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
                    <div className="py-1.5">
                        {options.map((opt) => {
                            const selected = opt.value === value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => { onChange(opt.value); setOpen(false); }}
                                    className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-muted transition-colors text-left"
                                >
                                    <span
                                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                            selected
                                                ? "border-[hsl(var(--brand-blue))] bg-[hsl(var(--brand-blue))]"
                                                : "border-border"
                                        }`}
                                    >
                                        {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                    </span>
                                    <span className={`text-sm ${selected ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                                        {opt.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── page ────────────────────────────────────────────────── */

export default function SubjectPage() {
    const { id } = useParams();
    const router = useRouter();
    const { user } = useAuthStore();
    const [groups, setGroups] = useState<TopicGroup[]>([]);
    const [subject, setSubject] = useState<Subject | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [multiSelect] = useState(true);
    const [randomize] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Filter bar visibility
    const [filtersOpen, setFiltersOpen] = useState(false);

    // Collapsed textbook groups
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const toggleGroupCollapse = (key: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    // Filter values
    const [diffFilter, setDiffFilter] = useState<DiffFilter>("all");
    const [savedFilter, setSavedFilter] = useState<SavedFilter>("all");
    const [completedFilter, setCompletedFilter] = useState<CompletedFilter>("all");
    const [answerFilter, setAnswerFilter] = useState<AnswerFilter>("all");

    // Filter data
    const [savedTopics, setSavedTopics] = useState<Set<string>>(new Set());
    const [progressMap, setProgressMap] = useState<Record<string, UserProgress>>({});
    const [topicDifficulty, setTopicDifficulty] = useState<Record<string, DiffFilter>>({});

    useEffect(() => {
        if (!id) return;
        const load = async () => {
            try {
                const [subData, textData, directTopics] = await Promise.all([
                    fetchSubjectById(id as string),
                    fetchTextbooksBySubject(id as string),
                    fetchTopicsBySubject(id as string),
                ]);
                setSubject(subData);
                
                const topicGroups: TopicGroup[] = [];
                if (directTopics.length > 0) {
                    topicGroups.push({ textbookId: null, textbookTitle: "Общие темы", topics: directTopics });
                }

                // Fetch topics for all textbooks in parallel
                const textbooksWithTopics = await Promise.all(
                    textData.map(async (tb) => {
                        const topics = await fetchTopicsByTextbook(tb.id);
                        return { textbookId: tb.id, textbookTitle: tb.title, topics };
                    })
                );
                
                topicGroups.push(...textbooksWithTopics);
                setGroups(topicGroups);

                // Collapse all textbook groups by default, leave "direct" open
                const textbookKeys = topicGroups
                    .filter(g => g.textbookId !== null)
                    .map(g => g.textbookId as string);
                setCollapsedGroups(new Set(textbookKeys));
            } catch (error) {
                console.error("Failed to load subject data:", error);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [id]);

    // Load saved topics from localStorage
    useEffect(() => {
        try {
            const raw = localStorage.getItem("savedTopics");
            if (raw) setSavedTopics(new Set(JSON.parse(raw) as string[]));
        } catch { /* ignore */ }
    }, []);

    // Load user progress (подколлекция users/{uid}/userProgress/{topicId})
    useEffect(() => {
        if (!user || groups.length === 0) return;
        const allIds = groups.flatMap((g) => g.topics.map((t) => t.id));
        if (allIds.length === 0) return;
        const idSet = new Set(allIds);
        let cancelled = false;
        const fetchProgress = async () => {
            try {
                const snap = await getDocs(collection(db, "users", user.id, "userProgress"));
                if (cancelled) return;
                const map: Record<string, UserProgress> = {};
                snap.forEach((d) => {
                    if (!idSet.has(d.id)) return;
                    const raw = d.data() as unknown as Partial<UserProgress>;
                    map[d.id] = { ...raw, topicId: raw.topicId ?? d.id } as UserProgress;
                });
                setProgressMap(map);
            } catch (e) {
                console.error("subject progress fetch failed", e);
            }
        };
        void fetchProgress();
        const onVisible = () => {
            if (document.visibilityState === "visible") void fetchProgress();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            cancelled = true;
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [user, groups]);

    // Load difficulty data lazily when filter is activated
    useEffect(() => {
        if (diffFilter === "all") return;
        const allIds = groups.flatMap((g) => g.topics.map((t) => t.id));
        if (allIds.length === 0) return;
        const fetchDifficulties = async () => {
            const chunks: string[][] = [];
            for (let i = 0; i < allIds.length; i += 10) chunks.push(allIds.slice(i, i + 10));
            const counts: Record<string, Record<string, number>> = {};
            await Promise.all(
                chunks.map(async (chunk) => {
                    const q = query(collection(db, "questions"), where("topicId", "in", chunk));
                    const snap = await getDocs(q);
                    snap.docs.forEach((d) => {
                        const data = d.data() as { topicId: string; difficulty: string };
                        if (!counts[data.topicId]) counts[data.topicId] = {};
                        counts[data.topicId][data.difficulty] = (counts[data.topicId][data.difficulty] || 0) + 1;
                    });
                })
            );
            const diffMap: Record<string, DiffFilter> = {};
            for (const topicId of Object.keys(counts)) {
                const c = counts[topicId];
                diffMap[topicId] = (Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "all") as DiffFilter;
            }
            setTopicDifficulty(diffMap);
        };
        fetchDifficulties().catch(() => {});
    }, [diffFilter, groups]);

    const toggleSaved = useCallback((topicId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSavedTopics((prev) => {
            const next = new Set(prev);
            if (next.has(topicId)) next.delete(topicId); else next.add(topicId);
            localStorage.setItem("savedTopics", JSON.stringify(Array.from(next)));
            return next;
        });
    }, []);

    const flatTopics = useMemo(() => {
        const list: { topic: Topic; textbookId: string | null }[] = [];
        for (const g of groups)
            for (const t of g.topics)
                list.push({ topic: t, textbookId: g.textbookId });
        return list;
    }, [groups]);

    const activeFilterCount = useMemo(() => {
        let n = 0;
        if (diffFilter !== "all") n++;
        if (savedFilter !== "all") n++;
        if (completedFilter !== "all") n++;
        if (answerFilter !== "all") n++;
        return n;
    }, [diffFilter, savedFilter, completedFilter, answerFilter]);

    const resetFilters = useCallback(() => {
        setDiffFilter("all");
        setSavedFilter("all");
        setCompletedFilter("all");
        setAnswerFilter("all");
    }, []);

    const topicPassesFilters = useCallback(
        (topic: Topic): boolean => {
            if (savedFilter === "saved" && !savedTopics.has(topic.id)) return false;
            if (savedFilter === "not_marked" && savedTopics.has(topic.id)) return false;
            const prog = progressMap[topic.id];
            if (completedFilter === "solved" && (!prog || prog.medal === "none")) return false;
            if (completedFilter === "unsolved" && prog && prog.medal !== "none") return false;
            if (answerFilter === "correct" && (!prog || prog.accuracy < 70)) return false;
            if (answerFilter === "incorrect" && (!prog || prog.accuracy >= 70)) return false;
            if (diffFilter !== "all") {
                const diff = topicDifficulty[topic.id];
                if (diff && diff !== diffFilter) return false;
            }
            return true;
        },
        [savedFilter, savedTopics, completedFilter, progressMap, answerFilter, diffFilter, topicDifficulty]
    );

    const displayGroups = useMemo(() => {
        const base = randomize
            ? groups.map((g) => ({ ...g, topics: [...g.topics].sort(() => Math.random() - 0.5) }))
            : groups;
        return base
            .map((g) => ({ ...g, topics: g.topics.filter(topicPassesFilters) }))
            .filter((g) => g.topics.length > 0 || (activeFilterCount === 0 && g.textbookId !== null));
    }, [groups, randomize, topicPassesFilters, activeFilterCount]);

    const totalQuestions = useMemo(
        () => flatTopics.reduce((s, { topic }) => s + (topic.totalQuestions || 0), 0),
        [flatTopics]
    );

    const completedTopicsCount = useMemo(
        () => flatTopics.filter(({ topic }) => {
            const prog = progressMap[topic.id];
            return prog && prog.medal && prog.medal !== "none";
        }).length,
        [flatTopics, progressMap]
    );

    const subjectCompletionPct = useMemo(
        () => flatTopics.length === 0 ? 0 : Math.round((completedTopicsCount / flatTopics.length) * 100),
        [completedTopicsCount, flatTopics.length]
    );

    const gradientClass = useMemo(() => {
        const sid = (id as string)?.toLowerCase() ?? "";
        if (sid === "english" || sid.includes("англ") || subject?.name.toLowerCase().includes("англ"))
            return "from-[#a855f7] via-[#c026d3] to-[#e879f9]";
        if (sid === "math" || sid.includes("матем") || subject?.name.toLowerCase().includes("матем"))
            return "from-[hsl(var(--brand-blue))] via-sky-400 to-cyan-400";
        return "from-slate-600 via-slate-500 to-slate-400";
    }, [id, subject]);

    const toggleTopic = useCallback(
        (topicId: string) => {
            setSelectedIds((prev) => {
                const next = new Set(multiSelect ? prev : []);
                if (next.has(topicId)) next.delete(topicId);
                else { if (!multiSelect) next.clear(); next.add(topicId); }
                return next;
            });
        },
        [multiSelect]
    );

    const selectAll = useCallback(() => {
        if (selectedIds.size === flatTopics.length) { setSelectedIds(new Set()); return; }
        setSelectedIds(new Set(flatTopics.map(({ topic }) => topic.id)));
    }, [flatTopics, selectedIds.size]);

    const startPractice = () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        const params = ids.length > 1 ? `?t=${ids.join(",")}` : "";
        router.push(`/test/${ids[0]}${params}`);
    };

    if (isLoading) {
        return (
            <div className="flex flex-col gap-6 py-4 animate-pulse">
                <div className="h-4 w-40 bg-muted rounded-full" />
                <div className="h-10 w-72 bg-muted rounded-2xl" />
                <div className="h-14 rounded-2xl bg-muted" />
                <div className="h-40 rounded-3xl bg-muted" />
            </div>
        );
    }

    if (!subject) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <p className="text-muted-foreground text-lg font-medium">Предмет не найден</p>
            </div>
        );
    }

    const hasGroups = groups.length > 0;
    const hasTopics = flatTopics.length > 0;

    return (
        <div className="flex flex-col gap-6 pb-28 pt-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                <Link href="/" className="hover:text-foreground transition-colors duration-200">
                    Главная
                </Link>
                <ChevronRight size={14} className="text-border" />
                <span className="text-foreground">{subject.name}</span>
            </nav>

            {/* Title */}
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Банк вопросов</h1>
                <p className="text-sm text-muted-foreground mt-1">{subject.name}</p>
            </div>

            {/* Toolbar row 1: Filters toggle + toggles */}
            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={() => setFiltersOpen((v) => !v)}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors duration-200 shadow-sm ${
                        filtersOpen || activeFilterCount > 0
                            ? "border-[hsl(var(--brand-blue))] bg-[hsl(var(--brand-blue-soft))] text-[hsl(var(--brand-blue))] dark:bg-[hsl(var(--brand-blue))]/15 dark:border-[hsl(var(--brand-blue))]/50"
                            : "border-border bg-card text-foreground hover:bg-muted dark:bg-muted/30 dark:hover:bg-muted/50"
                    }`}
                >
                    <Filter className="w-4 h-4" />
                    Фильтры
                    {activeFilterCount > 0 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--brand-blue))] text-white text-[11px] font-bold">
                            {activeFilterCount}
                        </span>
                    )}
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`} />
                </button>

            </div>

            {/* Toolbar row 2: individual filter buttons (shown when filtersOpen) */}
            {filtersOpen && (
                <div className="flex flex-wrap items-center gap-2">
                    <FilterButton<DiffFilter>
                        label="Сложность"
                        value={diffFilter}
                        onChange={setDiffFilter}
                        options={[
                            { value: "all", label: "Все" },
                            { value: "easy", label: "Лёгкий" },
                            { value: "medium", label: "Средний" },
                            { value: "hard", label: "Сложный" },
                        ]}
                    />
                    <FilterButton<SavedFilter>
                        label="Сохранённые"
                        value={savedFilter}
                        onChange={setSavedFilter}
                        options={[
                            { value: "all", label: "Все" },
                            { value: "saved", label: "Только сохранённые" },
                            { value: "not_marked", label: "Не помечены" },
                        ]}
                    />
                    <FilterButton<CompletedFilter>
                        label="Пройденные"
                        value={completedFilter}
                        onChange={setCompletedFilter}
                        options={[
                            { value: "all", label: "Все" },
                            { value: "solved", label: "Только решённые" },
                            { value: "unsolved", label: "Только нерешённые" },
                        ]}
                    />
                    <FilterButton<AnswerFilter>
                        label="Статус ответа"
                        value={answerFilter}
                        onChange={setAnswerFilter}
                        options={[
                            { value: "all", label: "Все" },
                            { value: "incorrect", label: "Только ошибочные" },
                            { value: "correct", label: "Только правильные" },
                        ]}
                    />
                    {activeFilterCount > 0 && (
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
                        >
                            Сбросить
                        </button>
                    )}
                </div>
            )}

            {/* Gradient header card */}
            <div
                className={`relative overflow-hidden rounded-3xl bg-gradient-to-r ${gradientClass} p-6 sm:p-8 text-white shadow-lg transition-all duration-300`}
            >
                <div className="absolute inset-0 bg-black/10 pointer-events-none" />
                <div className="relative flex items-start gap-4">
                    <TopicCheckbox
                        checked={hasTopics && selectedIds.size === flatTopics.length}
                        onChange={selectAll}
                        disabled={!hasTopics}
                    />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl sm:text-2xl font-bold tracking-tight drop-shadow-sm">{subject.name}</h2>
                                <p className="mt-0.5 text-sm text-white/80 font-medium">
                                    {totalQuestions} {pluralQuestions(totalQuestions)}
                                </p>
                            </div>
                            {completedTopicsCount > 0 && (
                                <div className="shrink-0 text-right">
                                    <span className="text-2xl sm:text-3xl font-bold tabular-nums drop-shadow-sm">{subjectCompletionPct}%</span>
                                    <p className="text-xs text-white/75 font-medium mt-0.5">{completedTopicsCount} / {flatTopics.length} тем</p>
                                </div>
                            )}
                        </div>
                        {hasTopics && completedTopicsCount > 0 && (
                            <div className="mt-4">
                                <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-white/80 transition-all duration-700"
                                        style={{ width: `${subjectCompletionPct}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Topic tree */}
            {!hasGroups ? (
                <div className="py-16 text-center rounded-3xl border border-border bg-muted/30">
                    <p className="text-muted-foreground font-medium">Учебники и темы для этого предмета пока не добавлены.</p>
                </div>
            ) : displayGroups.length === 0 ? (
                <div className="py-16 text-center rounded-3xl border border-border bg-muted/30">
                    <p className="text-muted-foreground font-medium">Нет тем, соответствующих выбранным фильтрам.</p>
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="mt-4 px-5 py-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                    >
                        Сбросить фильтры
                    </button>
                </div>
            ) : (() => {
                const directGroup = displayGroups.find(g => g.textbookId === null);
                const textbookGroups = displayGroups.filter(g => g.textbookId !== null);
                const hasTwo = directGroup && textbookGroups.length > 0;

                const renderTopicList = (group: TopicGroup) => (
                    <ul className="space-y-0">
                        {group.topics.map((topic) => {
                            const q = topic.totalQuestions || 0;
                            const selected = selectedIds.has(topic.id);
                            const isSaved = savedTopics.has(topic.id);
                            const prog = progressMap[topic.id];
                            const isCompleted = prog && prog.medal && prog.medal !== "none";
                            const topicPct = q > 0
                                ? Math.min(100, Math.round(((prog?.correctFirstCount ?? prog?.solvedQuestions ?? 0) / q) * 100))
                                : 0;
                            return (
                                <li key={topic.id}>
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                if (multiSelect) toggleTopic(topic.id);
                                                else router.push(`/test/${topic.id}`);
                                            }
                                        }}
                                        onClick={() => {
                                            if (multiSelect) toggleTopic(topic.id);
                                            else router.push(`/test/${topic.id}`);
                                        }}
                                        className={`flex cursor-pointer items-center gap-3 py-3 px-2 -mx-2 rounded-xl transition-colors duration-200 ${
                                            selected ? "bg-[hsl(var(--brand-blue-soft))]/50 dark:bg-[hsl(var(--brand-blue))]/15" : "hover:bg-muted/60 dark:hover:bg-white/5"
                                        }`}
                                    >
                                        <TopicCheckbox
                                            checked={selected}
                                            onChange={() => toggleTopic(topic.id)}
                                            stopPropagation
                                        />
                                        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                                            {/* Title + progress bar */}
                                            <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                                                <span className="truncate text-sm font-medium text-foreground leading-tight">
                                                    {topic.title}
                                                </span>
                                                {q > 0 && (
                                                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${
                                                                isCompleted ? "bg-emerald-500 dark:bg-emerald-400" : "bg-[hsl(var(--brand-blue))] opacity-70"
                                                            }`}
                                                            style={{ width: `${topicPct}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            {/* Right indicators */}
                                            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                                                <TopicProgressStats prog={prog} />
                                                {/* Medal + accuracy — desktop only */}
                                                {isCompleted && (
                                                    <div className="hidden sm:flex items-center gap-1">
                                                        <Trophy
                                                            size={12}
                                                            className={medalColor(prog!.medal as Medal)}
                                                        />
                                                        {prog!.accuracy > 0 && (
                                                            <span className={`text-xs font-semibold tabular-nums ${accuracyColor(prog!.accuracy)}`}>
                                                                {Math.round(prog!.accuracy)}%
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {/* Medal icon only — mobile */}
                                                {isCompleted && (
                                                    <Trophy
                                                        size={12}
                                                        className={`sm:hidden ${medalColor(prog!.medal as Medal)}`}
                                                    />
                                                )}
                                                <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap hidden sm:block">
                                                    {q} {pluralQuestionsShort(q)}
                                                </span>
                                                <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap sm:hidden">
                                                    {q}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={(e) => toggleSaved(topic.id, e)}
                                                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                                                        isSaved
                                                            ? "text-[hsl(var(--brand-blue))] hover:bg-[hsl(var(--brand-blue-soft))]"
                                                            : "text-muted-foreground/40 hover:bg-muted hover:text-foreground"
                                                    }`}
                                                    title={isSaved ? "Убрать из сохранённых" : "Сохранить тему"}
                                                >
                                                    {isSaved
                                                        ? <BookmarkCheck className="w-4 h-4" />
                                                        : <Bookmark className="w-4 h-4" />
                                                    }
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                );

                return (
                    <div className="bg-card border border-border rounded-[2rem] shadow-sm overflow-hidden">
                        <div className={hasTwo ? "grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] items-stretch" : "flex flex-col"}>
                            {/* Left Column: Учебники */}
                            <div className={`p-6 sm:p-8 ${hasTwo ? "lg:border-r border-border" : "border-b border-border"}`}>
                                <h3 className="text-[17px] font-bold text-foreground mb-4">Учебники</h3>
                                <div className="h-px bg-border -mx-8 mb-6" /> {/* Divider line below header */}
                                
                                {textbookGroups.length > 0 ? (
                                    <div className="space-y-3">
                                        {textbookGroups.map((group) => {
                                            const groupKey = group.textbookId as string;
                                            const isCollapsed = collapsedGroups.has(groupKey);
                                            return (
                                                <div key={groupKey} className="rounded-2xl border border-border bg-muted/20 overflow-hidden">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleGroupCollapse(groupKey)}
                                                        className="flex w-full items-center justify-between gap-3 px-5 py-4 hover:bg-muted/40 transition-colors text-left"
                                                    >
                                                        <span className="text-sm font-bold text-foreground tracking-tight leading-snug">{group.textbookTitle}</span>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span className="text-xs text-muted-foreground font-medium tabular-nums">{group.topics.length} тем</span>
                                                            <ChevronDown
                                                                size={16}
                                                                className={`text-muted-foreground transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                                                            />
                                                        </div>
                                                    </button>
                                                    {!isCollapsed && (
                                                        <div className="px-5 py-3 bg-card border-t border-border">
                                                            {group.topics.length > 0 ? renderTopicList(group) : (
                                                                <p className="text-sm text-muted-foreground py-4 italic font-medium text-center">
                                                                    Темы для этого учебника скоро появятся.
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground py-12 text-center italic">Учебники не добавлены</p>
                                )}
                            </div>

                            {/* Right Column: Темы для изучения */}
                            <div className="p-6 sm:p-8 bg-muted/5">
                                <h3 className="text-[17px] font-bold text-foreground mb-4">Темы для изучения</h3>
                                <div className="h-px bg-border -mx-8 mb-6" /> {/* Divider line below header */}

                                {directGroup ? (() => {
                                    return (
                                        <div className="space-y-4">
                                            {renderTopicList(directGroup)}
                                        </div>
                                    );
                                })() : (
                                    <p className="text-sm text-muted-foreground py-12 text-center italic">Дополнительные темы не найдены</p>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}


            {/* FAB */}
            {hasTopics && (
                <div className="fixed bottom-6 left-1/2 z-40 w-[min(92vw,22rem)] -translate-x-1/2 sm:left-auto sm:right-10 sm:translate-x-0 sm:w-auto">
                    <button
                        type="button"
                        onClick={startPractice}
                        disabled={selectedIds.size === 0}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-8 py-3.5 text-sm font-bold text-background shadow-lg transition-all duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
                    >
                        Начать практику ({selectedIds.size})
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}

function pluralQuestions(n: number) {
    const m = n % 100; const m10 = n % 10;
    if (m >= 11 && m <= 14) return "вопросов";
    if (m10 === 1) return "вопрос";
    if (m10 >= 2 && m10 <= 4) return "вопроса";
    return "вопросов";
}

function pluralQuestionsShort(n: number) {
    const m = n % 100; const m10 = n % 10;
    if (m >= 11 && m <= 14) return "вопросов";
    if (m10 === 1) return "вопрос";
    if (m10 >= 2 && m10 <= 4) return "вопроса";
    return "вопросов";
}
