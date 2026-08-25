"use client";

import { Fragment, useEffect, useState } from "react";
import { adminFetchCollection, adminAddItem, adminDeleteItem, adminUpdateItem } from "@/lib/admin-utils";
import { Topic, Textbook, Subject } from "@/lib/firestore-schema";
import { Plus, Trash2, ListTree, Edit2, X, BookOpen, Layers } from "lucide-react";
import { fetchTextbooksBySubject, fetchTopicsByTextbook, fetchTopicsBySubject } from "@/lib/data-fetching";
import { pageCache } from "@/lib/page-cache";
import { useStatsStore } from "@/store/useStatsStore";

type Mode = "textbook" | "direct";

export default function AdminTopicsPage() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [textbooks, setTextbooks] = useState<Textbook[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);

    const [mode, setMode] = useState<Mode>("textbook");
    const [selectedSubject, setSelectedSubject] = useState("");
    const [selectedTextbook, setSelectedTextbook] = useState("");

    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Форма создания
    const [title, setTitle] = useState("");
    const [order, setOrder] = useState("");

    // Форма редактирования
    const [editTitle, setEditTitle] = useState("");
    const [editOrder, setEditOrder] = useState("");

    useEffect(() => {
        adminFetchCollection("subjects", "name").then((data) => {
            const nextSubjects = (data as Array<Record<string, unknown>>).map((item) => ({
                id: String(item.id ?? ""),
                name: String(item.name ?? ""),
                emoji: String(item.emoji ?? ""),
                color: String(item.color ?? ""),
                order: Number(item.order ?? 0),
                backgroundImage: item.backgroundImage ? String(item.backgroundImage) : undefined,
            })) as Subject[];
            setSubjects(nextSubjects);
            setIsLoading(false);
        });
    }, []);

    // При смене режима — сброс
    const switchMode = (m: Mode) => {
        setMode(m);
        setSelectedSubject("");
        setSelectedTextbook("");
        setTopics([]);
        setIsAdding(false);
        setEditingId(null);
    };

    useEffect(() => {
        if (selectedSubject && mode === "textbook") {
            fetchTextbooksBySubject(selectedSubject).then(setTextbooks);
            setSelectedTextbook("");
            setTopics([]);
        }
        if (selectedSubject && mode === "direct") {
            setEditingId(null);
            fetchTopicsBySubject(selectedSubject).then(setTopics);
        }
    }, [selectedSubject, mode]);

    useEffect(() => {
        if (mode !== "textbook") return;
        setEditingId(null);
        if (selectedTextbook) {
            fetchTopicsByTextbook(selectedTextbook).then(setTopics);
        } else {
            setTopics([]);
        }
    }, [selectedTextbook, mode]);

    const canAdd = mode === "textbook" ? Boolean(selectedTextbook) : Boolean(selectedSubject);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canAdd) return;
        try {
            const newTopic: Record<string, unknown> = {
                title,
                order: parseInt(order) || topics.length + 1,
                totalQuestions: 0,
            };
            if (mode === "textbook") {
                newTopic.textbookId = selectedTextbook;
            } else {
                newTopic.subjectId = selectedSubject;
            }
            const created = await adminAddItem("topics", newTopic);
            pageCache.invalidatePrefix("topics");
            useStatsStore.getState().reset();
            const nextTopic = {
                id: String(created.id ?? ""),
                title: String(created.title ?? title),
                order: Number(created.order ?? 0),
                totalQuestions: Number(created.totalQuestions ?? 0),
                textbookId: created.textbookId ? String(created.textbookId) : undefined,
                subjectId: created.subjectId ? String(created.subjectId) : undefined,
            } as Topic;
            setTopics(prev => [...prev, nextTopic].sort((a, b) => a.order - b.order));
            setTitle("");
            setOrder("");
            setIsAdding(false);
        } catch {
            alert("Ошибка при добавлении темы");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Вы уверены? Это не удалит вопросы в этой теме.")) return;
        try {
            await adminDeleteItem("topics", id);
            pageCache.invalidatePrefix("topics");
            useStatsStore.getState().reset();
            setTopics((prev) => prev.filter((t) => t.id !== id));
            if (editingId === id) setEditingId(null);
        } catch {
            alert("Ошибка при удалении");
        }
    };

    const startEdit = (t: Topic) => {
        setIsAdding(false);
        setEditingId(t.id);
        setEditTitle(t.title);
        setEditOrder(String(t.order ?? 0));
    };

    const cancelEdit = () => setEditingId(null);

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingId) return;
        const orderNum = Number.parseInt(editOrder, 10);
        if (Number.isNaN(orderNum)) {
            alert("Порядок — целое число");
            return;
        }
        const current = topics.find((t) => t.id === editingId);
        if (!current) return;
        try {
            const payload: Record<string, unknown> = {
                title: editTitle.trim(),
                order: orderNum,
            };
            if (current.textbookId) payload.textbookId = current.textbookId;
            if (current.subjectId) payload.subjectId = current.subjectId;
            await adminUpdateItem("topics", editingId, payload);
            pageCache.invalidatePrefix("topics");
            useStatsStore.getState().reset();
            setTopics((prev) =>
                prev
                    .map((t) => (t.id === editingId ? { ...t, ...payload } : t))
                    .sort((a, b) => a.order - b.order)
            );
            setEditingId(null);
        } catch {
            alert("Ошибка при сохранении");
        }
    };

    const emptyMessage = mode === "textbook"
        ? (!selectedTextbook ? "Пожалуйста, выберите учебник, чтобы увидеть темы" : "Темы не найдены.")
        : (!selectedSubject ? "Пожалуйста, выберите предмет, чтобы увидеть темы" : "Темы не найдены.");

    return (
        <div className="flex flex-col gap-12">
            <div className="flex items-center justify-between">
                <section>
                    <h1 className="text-4xl font-semibold tracking-tight text-foreground">Темы.</h1>
                    <p className="text-muted-foreground mt-2">Управление главами и разделами.</p>
                </section>
                <button
                    onClick={() => {
                        setIsAdding((v) => !v);
                        if (!isAdding) setEditingId(null);
                    }}
                    disabled={!canAdd}
                    className="bg-foreground text-background px-6 py-3 rounded-xl font-medium flex items-center gap-2 hover:opacity-90 disabled:opacity-30 transition-all shadow-sm"
                >
                    <Plus size={20} />
                    <span>Новая тема</span>
                </button>
            </div>

            {/* Mode toggle */}
            <div className="flex items-center gap-2 p-1 bg-muted rounded-xl w-fit">
                <button
                    type="button"
                    onClick={() => switchMode("textbook")}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                        mode === "textbook"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <BookOpen size={16} />
                    С учебником
                </button>
                <button
                    type="button"
                    onClick={() => switchMode("direct")}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                        mode === "direct"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <Layers size={16} />
                    Без учебника
                </button>
            </div>

            {/* Filters */}
            <section className={`grid grid-cols-1 gap-6 bg-card border border-border rounded-2xl p-6 ${mode === "textbook" ? "md:grid-cols-2" : "md:grid-cols-1 max-w-sm"}`}>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Фильтр по предмету</label>
                    <select
                        value={selectedSubject}
                        onChange={e => setSelectedSubject(e.target.value)}
                        className="w-full bg-muted border border-border rounded-lg p-3 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 appearance-none"
                    >
                        <option value="">Выберите предмет</option>
                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                {mode === "textbook" && (
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Фильтр по учебнику</label>
                        <select
                            value={selectedTextbook}
                            onChange={e => setSelectedTextbook(e.target.value)}
                            disabled={!selectedSubject}
                            className="w-full bg-muted border border-border rounded-lg p-3 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 appearance-none disabled:opacity-50"
                        >
                            <option value="">Выберите учебник</option>
                            {textbooks.map(t => <option key={t.id} value={t.id}>{t.title} ({t.grade} класс)</option>)}
                        </select>
                    </div>
                )}
            </section>

            {isAdding && (
                <form onSubmit={handleCreate} className="bg-card border border-border rounded-2xl p-8 flex flex-col md:flex-row gap-6 items-end animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex-[2] space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Название темы</label>
                        <input
                            value={title} onChange={e => setTitle(e.target.value)} required
                            className="w-full bg-muted border border-border rounded-lg p-3 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                            placeholder="Древний Египет"
                        />
                    </div>
                    <div className="w-24 space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Порядок</label>
                        <input
                            type="number"
                            value={order} onChange={e => setOrder(e.target.value)} required
                            className="w-full bg-muted border border-border rounded-lg p-3 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                            placeholder="1"
                        />
                    </div>
                    <button type="submit" className="bg-foreground text-background px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-all">
                        Создать
                    </button>
                </form>
            )}

            <section className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-muted/50 border-b border-border">
                        <tr>
                            <th className="px-8 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Порядок</th>
                            <th className="px-8 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Название</th>
                            <th className="px-8 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Вопросы</th>
                            <th className="px-8 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {isLoading ? (
                            [1, 2, 3].map(i => <tr key={i} className="h-20 animate-pulse bg-muted/20" />)
                        ) : topics.length > 0 ? (
                            topics.map((topic) => (
                                <Fragment key={topic.id}>
                                    <tr className="hover:bg-muted/40 transition-colors group text-sm">
                                        <td className="px-8 py-6 font-mono text-muted-foreground">#{topic.order}</td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <ListTree size={18} className="text-muted-foreground shrink-0" />
                                                <span className="font-semibold text-foreground tracking-tight">{topic.title}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-muted-foreground font-medium tabular-nums">
                                            {topic.totalQuestions}
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        editingId === topic.id ? cancelEdit() : startEdit(topic)
                                                    }
                                                    className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                                    title={editingId === topic.id ? "Закрыть" : "Редактировать"}
                                                >
                                                    {editingId === topic.id ? <X size={18} /> : <Edit2 size={18} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(topic.id)}
                                                    className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-600 transition-colors"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {editingId === topic.id && (
                                        <tr className="border-b border-border bg-muted/25">
                                            <td colSpan={4} className="px-8 py-6">
                                                <form onSubmit={handleSaveEdit} className="flex flex-col gap-4">
                                                    <p className="text-sm font-semibold text-foreground">Редактирование темы</p>
                                                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                                        <div className="space-y-2 sm:col-span-2">
                                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                                                Название
                                                            </label>
                                                            <input
                                                                value={editTitle}
                                                                onChange={(e) => setEditTitle(e.target.value)}
                                                                required
                                                                className="w-full rounded-lg border border-border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                                                Порядок
                                                            </label>
                                                            <input
                                                                type="number"
                                                                value={editOrder}
                                                                onChange={(e) => setEditOrder(e.target.value)}
                                                                className="w-full rounded-lg border border-border bg-background p-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/30"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        <button
                                                            type="submit"
                                                            className="rounded-lg bg-foreground px-6 py-2.5 text-sm font-semibold text-background hover:opacity-90 transition-opacity"
                                                        >
                                                            Сохранить
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={cancelEdit}
                                                            className="rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-semibold hover:bg-muted transition-colors"
                                                        >
                                                            Отмена
                                                        </button>
                                                    </div>
                                                </form>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={4} className="px-8 py-12 text-center text-muted-foreground font-medium whitespace-pre">
                                    {emptyMessage}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
