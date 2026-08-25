"use client";

import { useEffect, useState } from "react";
import { adminFetchCollection, adminAddItem, adminDeleteItem } from "@/lib/admin-utils";
import { Textbook, Subject } from "@/lib/firestore-schema";
import { Plus, Trash2, Library } from "lucide-react";
import { pageCache } from "@/lib/page-cache";
import { useStatsStore } from "@/store/useStatsStore";

export default function AdminTextbooksPage() {
    const [textbooks, setTextbooks] = useState<Textbook[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

    // Форма
    const [title, setTitle] = useState("");
    const [grade, setGrade] = useState("");
    const [subjectId, setSubjectId] = useState("");

    useEffect(() => {
        Promise.all([
            adminFetchCollection("textbooks"),
            adminFetchCollection("subjects", "name")
        ]).then(([textData, subData]) => {
            const nextTextbooks = (textData as Array<Record<string, unknown>>).map((item) => ({
                id: String(item.id ?? ""),
                subjectId: String(item.subjectId ?? ""),
                title: String(item.title ?? ""),
                grade: String(item.grade ?? ""),
                coverImage: item.coverImage ? String(item.coverImage) : undefined,
            })) as Textbook[];
            const nextSubjects = (subData as Array<Record<string, unknown>>).map((item) => ({
                id: String(item.id ?? ""),
                name: String(item.name ?? ""),
                emoji: String(item.emoji ?? ""),
                color: String(item.color ?? ""),
                order: Number(item.order ?? 0),
                backgroundImage: item.backgroundImage ? String(item.backgroundImage) : undefined,
            })) as Subject[];
            setTextbooks(nextTextbooks);
            setSubjects(nextSubjects);
            setIsLoading(false);
        });
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!subjectId) return;
        try {
            const newTextbook = { title, grade, subjectId, coverImage: "" };
            const created = await adminAddItem("textbooks", newTextbook);
            pageCache.invalidatePrefix("textbooks");
            useStatsStore.getState().reset();
            const nextTextbook = {
                id: String(created.id ?? ""),
                subjectId: String(created.subjectId ?? subjectId),
                title: String(created.title ?? title),
                grade: String(created.grade ?? grade),
                coverImage: created.coverImage ? String(created.coverImage) : undefined,
            } as Textbook;
            setTextbooks(prev => [nextTextbook, ...prev]);
            setTitle("");
            setGrade("");
            setIsAdding(false);
        } catch {
            alert("Ошибка при добавлении учебника");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Вы уверены?")) return;
        try {
            await adminDeleteItem("textbooks", id);
            pageCache.invalidatePrefix("textbooks");
            useStatsStore.getState().reset();
            setTextbooks(prev => prev.filter(t => t.id !== id));
        } catch {
            alert("Ошибка при удалении");
        }
    };

    return (
        <div className="flex flex-col gap-12">
            <div className="flex items-center justify-between">
                <section>
                    <h1 className="text-4xl font-semibold tracking-tight text-foreground">Учебники.</h1>
                    <p className="text-muted-foreground mt-2">Создание и привязка учебников к конкретным предметам.</p>
                </section>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="bg-foreground text-background px-6 py-3 rounded-xl font-medium flex items-center gap-2 hover:opacity-90 transition-all shadow-sm"
                >
                    <Plus size={20} />
                    <span>Новый учебник</span>
                </button>
            </div>

            {isAdding && (
                <form onSubmit={handleCreate} className="bg-card border border-border rounded-2xl p-8 flex flex-col md:flex-row gap-6 items-end animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex-[2] space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Название</label>
                        <input
                            value={title} onChange={e => setTitle(e.target.value)} required
                            className="w-full bg-muted border border-border rounded-lg p-3 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                            placeholder="Физика 10 класс"
                        />
                    </div>
                    <div className="flex-1 space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Класс</label>
                        <input
                            value={grade} onChange={e => setGrade(e.target.value)} required
                            className="w-full bg-muted border border-border rounded-lg p-3 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                            placeholder="10"
                        />
                    </div>
                    <div className="flex-1 space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Привязать к предмету</label>
                        <select
                            value={subjectId} onChange={e => setSubjectId(e.target.value)} required
                            className="w-full bg-muted border border-border rounded-lg p-3 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 appearance-none"
                        >
                            <option value="">Выберите предмет</option>
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <button type="submit" className="bg-foreground text-background px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-all">
                        Привязать
                    </button>
                </form>
            )}

            <section className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-muted/50 border-b border-border">
                        <tr>
                            <th className="px-8 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Название</th>
                            <th className="px-8 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Предмет</th>
                            <th className="px-8 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Класс</th>
                            <th className="px-8 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                                {isLoading ? (
                                    [1, 2, 3].map(i => <tr key={i} className="h-20 animate-pulse bg-muted/20" />)
                                ) : textbooks.length > 0 ? (
                                    textbooks.map(textbook => {
                                        const textbookSubjectId = String(textbook.subjectId).trim();
                                        const subject = subjects.find(s => s.id === textbookSubjectId);
                                return (
                                    <tr key={textbook.id} className="hover:bg-muted/40 transition-colors group text-sm">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <Library size={18} className="text-muted-foreground" />
                                                <span className="font-semibold text-foreground tracking-tight">{textbook.title}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-muted-foreground font-medium">{subject?.name || "Неизвестно"}</td>
                                        <td className="px-8 py-6 text-muted-foreground">{textbook.grade}</td>
                                        <td className="px-8 py-6 text-right flex items-center justify-end gap-2">
                                            <a
                                                href={`/admin/topics?textbookId=${textbook.id}`}
                                                className="text-xs font-bold uppercase tracking-widest text-blue-600 hover:underline"
                                            >
                                                Темы
                                            </a>
                                            <button onClick={() => handleDelete(textbook.id)} className="p-2 text-muted-foreground hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={4} className="px-8 py-12 text-center text-muted-foreground font-medium">Учебники не найдены.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
