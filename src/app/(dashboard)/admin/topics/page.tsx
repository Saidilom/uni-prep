"use client";

import { useEffect, useState } from "react";
import { adminFetchCollection, adminAddItem, adminDeleteItem } from "@/lib/admin-utils";
import { Topic, Textbook, Subject } from "@/lib/firestore-schema";
import { Plus, Trash2, ListTree } from "lucide-react";
import { fetchTextbooksBySubject, fetchTopicsByTextbook } from "@/lib/data-fetching";

export default function AdminTopicsPage() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [textbooks, setTextbooks] = useState<Textbook[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);

    const [selectedSubject, setSelectedSubject] = useState("");
    const [selectedTextbook, setSelectedTextbook] = useState("");

    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

    // Форма
    const [title, setTitle] = useState("");
    const [order, setOrder] = useState("");
    const [totalQuestions, setTotalQuestions] = useState("");

    useEffect(() => {
        adminFetchCollection("subjects", "name").then(data => {
            setSubjects(data as Subject[]);
            setIsLoading(false);
        });
    }, []);

    useEffect(() => {
        if (selectedSubject) {
            fetchTextbooksBySubject(selectedSubject).then(setTextbooks);
            setSelectedTextbook("");
            setTopics([]);
        }
    }, [selectedSubject]);

    useEffect(() => {
        if (selectedTextbook) {
            fetchTopicsByTextbook(selectedTextbook).then(setTopics);
        }
    }, [selectedTextbook]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTextbook) return;
        try {
            const newTopic = {
                title,
                textbookId: selectedTextbook,
                order: parseInt(order) || topics.length + 1,
                totalQuestions: parseInt(totalQuestions) || 0
            };
            const created = await adminAddItem("topics", newTopic);
            setTopics(prev => [...prev, created as Topic].sort((a, b) => a.order - b.order));
            setTitle("");
            setOrder("");
            setTotalQuestions("");
            setIsAdding(false);
        } catch {
            alert("Ошибка при добавлении темы");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Вы уверены? Это не удалит вопросы в этой теме.")) return;
        try {
            await adminDeleteItem("topics", id);
            setTopics(prev => prev.filter(t => t.id !== id));
        } catch {
            alert("Ошибка при удалении");
        }
    };

    return (
        <div className="flex flex-col gap-12">
            <div className="flex items-center justify-between">
                <section>
                    <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">Темы.</h1>
                    <p className="text-neutral-500 mt-2">Управление главами и разделами внутри учебников.</p>
                </section>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    disabled={!selectedTextbook}
                    className="bg-neutral-900 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 hover:opacity-90 disabled:opacity-30 transition-all shadow-sm"
                >
                    <Plus size={20} />
                    <span>Новая тема</span>
                </button>
            </div>

            {/* Selection Filters */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white border border-neutral-200 rounded-2xl p-6">
                <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Фильтр по предмету</label>
                    <select
                        value={selectedSubject}
                        onChange={e => setSelectedSubject(e.target.value)}
                        className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-3 focus:outline-none focus:border-neutral-900 appearance-none"
                    >
                        <option value="">Выберите предмет</option>
                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Фильтр по учебнику</label>
                    <select
                        value={selectedTextbook}
                        onChange={e => setSelectedTextbook(e.target.value)}
                        disabled={!selectedSubject}
                        className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-3 focus:outline-none focus:border-neutral-900 appearance-none disabled:opacity-50"
                    >
                        <option value="">Выберите учебник</option>
                        {textbooks.map(t => <option key={t.id} value={t.id}>{t.title} ({t.grade} класс)</option>)}
                    </select>
                </div>
            </section>

            {isAdding && (
                <form onSubmit={handleCreate} className="bg-white border border-neutral-200 rounded-2xl p-8 flex flex-col md:flex-row gap-6 items-end animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex-[2] space-y-2">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Название темы</label>
                        <input
                            value={title} onChange={e => setTitle(e.target.value)} required
                            className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-3 focus:outline-none focus:border-neutral-900"
                            placeholder="Древний Египет"
                        />
                    </div>
                    <div className="w-24 space-y-2">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Порядок</label>
                        <input
                            type="number"
                            value={order} onChange={e => setOrder(e.target.value)} required
                            className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-3 focus:outline-none focus:border-neutral-900"
                            placeholder="1"
                        />
                    </div>
                    <div className="w-32 space-y-2">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Вопросы</label>
                        <input
                            type="number"
                            value={totalQuestions} onChange={e => setTotalQuestions(e.target.value)} required
                            className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-3 focus:outline-none focus:border-neutral-900"
                            placeholder="30"
                        />
                    </div>
                    <button type="submit" className="bg-neutral-900 text-white px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-all">
                        Создать
                    </button>
                </form>
            )}

            <section className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-neutral-50/50 border-b border-neutral-100">
                        <tr>
                            <th className="px-8 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest">Порядок</th>
                            <th className="px-8 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest">Название</th>
                            <th className="px-8 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest">Вопросы</th>
                            <th className="px-8 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest text-right">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {isLoading ? (
                            [1, 2, 3].map(i => <tr key={i} className="h-20 animate-pulse bg-neutral-50/20" />)
                        ) : topics.length > 0 ? (
                            topics.map(topic => (
                                <tr key={topic.id} className="hover:bg-neutral-50/30 transition-colors group text-sm">
                                    <td className="px-8 py-6 font-mono text-neutral-400">#{topic.order}</td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-3">
                                            <ListTree size={18} className="text-neutral-400" />
                                            <span className="font-semibold text-neutral-900 tracking-tight">{topic.title}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-neutral-500 font-medium">{topic.totalQuestions}</td>
                                    <td className="px-8 py-6 text-right">
                                        <button onClick={() => handleDelete(topic.id)} className="p-2 text-neutral-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={4} className="px-8 py-12 text-center text-neutral-400 font-medium whitespace-pre">
                                    {!selectedTextbook ? "Пожалуйста, выберите учебник, чтобы увидеть темы" : "Темы не найдены."}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
