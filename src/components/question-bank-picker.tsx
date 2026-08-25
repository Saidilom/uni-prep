"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Search, Plus } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { SUBJECTS } from "@/lib/constants";

export type BankQuestion = {
    id: string;
    text: string;
    options: Record<string, string>;
    correct_answer: string;
    points: number;
    subject: string | null;
    topic: string | null;
    difficulty: "easy" | "medium" | "hard";
    image_url: string | null;
};

const difficultyLabel: Record<string, string> = { easy: "Простой", medium: "Средний", hard: "Сложный" };

export default function QuestionBankPicker({ onAdd, onClose }: { onAdd: (q: BankQuestion) => void; onClose: () => void }) {
    const [items, setItems] = useState<BankQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [subjectFilter, setSubjectFilter] = useState("");
    const [topicFilter, setTopicFilter] = useState("");
    const [difficultyFilter, setDifficultyFilter] = useState("");
    const [added, setAdded] = useState<Set<string>>(new Set());

    useEffect(() => {
        supabase.from("question_bank").select("*").order("created_at", { ascending: false }).then(({ data }) => {
            if (data) setItems(data as BankQuestion[]);
            setLoading(false);
        });
    }, []);

    const topics = useMemo(() => {
        const set = new Set<string>();
        items.forEach((q) => { if (q.topic) set.add(q.topic); });
        return Array.from(set).sort();
    }, [items]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return items.filter((item) => {
            if (q && !item.text.toLowerCase().includes(q)) return false;
            if (subjectFilter && item.subject !== subjectFilter) return false;
            if (topicFilter && item.topic !== topicFilter) return false;
            if (difficultyFilter && item.difficulty !== difficultyFilter) return false;
            return true;
        });
    }, [items, query, subjectFilter, topicFilter, difficultyFilter]);

    const handleAdd = (q: BankQuestion) => {
        onAdd(q);
        setAdded((prev) => new Set(prev).add(q.id));
    };

    return (
        <div className="fixed inset-0 z-[500] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border border-border bg-card shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b border-border flex items-center justify-between shrink-0">
                    <h2 className="text-xl font-bold text-foreground">Добавить из банка вопросов</h2>
                    <button onClick={onClose} className="h-9 w-9 rounded-2xl border border-border bg-card hover:bg-muted transition-colors flex items-center justify-center">
                        <X size={16} className="text-muted-foreground" />
                    </button>
                </div>

                <div className="p-4 border-b border-border shrink-0 space-y-3">
                    <div className="relative">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Поиск по тексту вопроса…"
                            className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm text-foreground"
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground">
                            <option value="">Все предметы</option>
                            {SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground">
                            <option value="">Все темы</option>
                            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground">
                            <option value="">Любая сложность</option>
                            <option value="easy">Простой</option>
                            <option value="medium">Средний</option>
                            <option value="hard">Сложный</option>
                        </select>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading ? (
                        <p className="py-10 text-center text-sm text-muted-foreground">Загрузка…</p>
                    ) : filtered.length === 0 ? (
                        <p className="py-10 text-center text-sm text-muted-foreground">Вопросы не найдены. Создайте их на странице «Банк вопросов».</p>
                    ) : (
                        filtered.map((q) => {
                            const isAdded = added.has(q.id);
                            const subjectName = SUBJECTS.find((s) => s.id === q.subject)?.name;
                            return (
                                <div key={q.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-foreground">{q.text}</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {subjectName || "Без предмета"}{q.topic ? ` • ${q.topic}` : ""} • {difficultyLabel[q.difficulty]}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleAdd(q)}
                                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${isAdded ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : "bg-foreground text-background hover:opacity-90"}`}
                                    >
                                        <Plus size={14} /> {isAdded ? "Добавлено" : "Добавить"}
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="p-4 border-t border-border shrink-0">
                    <button onClick={onClose} className="w-full rounded-2xl border border-border px-6 py-3 text-sm font-semibold hover:bg-muted transition-colors">Готово</button>
                </div>
            </div>
        </div>
    );
}
