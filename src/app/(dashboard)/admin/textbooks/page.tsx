"use client";

import { useEffect, useState } from "react";
import { adminFetchCollection, adminAddItem, adminDeleteItem } from "@/lib/admin-utils";
import { Textbook, Subject } from "@/lib/firestore-schema";
import { Plus, Trash2, Library } from "lucide-react";

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
            setTextbooks(textData as Textbook[]);
            setSubjects(subData as Subject[]);
            setIsLoading(false);
        });
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!subjectId) return;
        try {
            const newTextbook = { title, grade, subjectId, coverImage: "" };
            const created = await adminAddItem("textbooks", newTextbook);
            setTextbooks(prev => [created as Textbook, ...prev]);
            setTitle("");
            setGrade("");
            setIsAdding(false);
        } catch (error) {
            alert("Ошибка при добавлении учебника");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Вы уверены?")) return;
        try {
            await adminDeleteItem("textbooks", id);
            setTextbooks(prev => prev.filter(t => t.id !== id));
        } catch (error) {
            alert("Ошибка при удалении");
        }
    };

    return (
        <div className="flex flex-col gap-12">
            <div className="flex items-center justify-between">
                <section>
                    <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">Учебники.</h1>
                    <p className="text-neutral-500 mt-2">Создание и привязка учебников к конкретным предметам.</p>
                </section>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="bg-neutral-900 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 hover:opacity-90 transition-all shadow-sm"
                >
                    <Plus size={20} />
                    <span>Новый учебник</span>
                </button>
            </div>

            {isAdding && (
                <form onSubmit={handleCreate} className="bg-white border border-neutral-200 rounded-2xl p-8 flex flex-col md:flex-row gap-6 items-end animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex-[2] space-y-2">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Название</label>
                        <input
                            value={title} onChange={e => setTitle(e.target.value)} required
                            className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-3 focus:outline-none focus:border-neutral-900"
                            placeholder="Физика 10 класс"
                        />
                    </div>
                    <div className="flex-1 space-y-2">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Класс</label>
                        <input
                            value={grade} onChange={e => setGrade(e.target.value)} required
                            className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-3 focus:outline-none focus:border-neutral-900"
                            placeholder="10"
                        />
                    </div>
                    <div className="flex-1 space-y-2">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Привязать к предмету</label>
                        <select
                            value={subjectId} onChange={e => setSubjectId(e.target.value)} required
                            className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-3 focus:outline-none focus:border-neutral-900 appearance-none"
                        >
                            <option value="">Выберите предмет</option>
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <button type="submit" className="bg-neutral-900 text-white px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-all">
                        Привязать
                    </button>
                </form>
            )}

            <section className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-neutral-50/50 border-b border-neutral-100">
                        <tr>
                            <th className="px-8 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest">Название</th>
                            <th className="px-8 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest">Предмет</th>
                            <th className="px-8 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest">Класс</th>
                            <th className="px-8 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest text-right">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {isLoading ? (
                            [1, 2, 3].map(i => <tr key={i} className="h-20 animate-pulse bg-neutral-50/20" />)
                        ) : textbooks.length > 0 ? (
                            textbooks.map(textbook => {
                                const subject = subjects.find(s => s.id === textbook.subjectId);
                                return (
                                    <tr key={textbook.id} className="hover:bg-neutral-50/30 transition-colors group text-sm">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <Library size={18} className="text-neutral-400" />
                                                <span className="font-semibold text-neutral-900 tracking-tight">{textbook.title}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-neutral-500 font-medium">{subject?.name || "Неизвестно"}</td>
                                        <td className="px-8 py-6 text-neutral-500">{textbook.grade}</td>
                                        <td className="px-8 py-6 text-right flex items-center justify-end gap-2">
                                            <a
                                                href={`/admin/topics?textbookId=${textbook.id}`}
                                                className="text-xs font-bold uppercase tracking-widest text-blue-600 hover:underline"
                                            >
                                                Темы
                                            </a>
                                            <button onClick={() => handleDelete(textbook.id)} className="p-2 text-neutral-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={4} className="px-8 py-12 text-center text-neutral-400 font-medium">Учебники не найдены.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
