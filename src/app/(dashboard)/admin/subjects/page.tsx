"use client";

import { useEffect, useState } from "react";
import { adminFetchCollection, adminAddItem, adminDeleteItem } from "@/lib/admin-utils";
import { Subject } from "@/lib/firestore-schema";
import { Plus, Trash2, Edit2, Search } from "lucide-react";

export default function AdminSubjectsPage() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

    // Форма
    const [name, setName] = useState("");
    const [emoji, setEmoji] = useState("");
    const [color, setColor] = useState("#000000");

    useEffect(() => {
        adminFetchCollection("subjects", "order").then(data => {
            setSubjects(data as Subject[]);
            setIsLoading(false);
        });
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const newSubject = { name, emoji, color, order: subjects.length };
            const created = await adminAddItem("subjects", newSubject);
            setSubjects(prev => [...prev, created as Subject]);
            setName("");
            setEmoji("");
            setIsAdding(false);
        } catch (error) {
            alert("Ошибка при добавлении предмета");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Вы уверены? Это не удалит связанные учебники.")) return;
        try {
            await adminDeleteItem("subjects", id);
            setSubjects(prev => prev.filter(s => s.id !== id));
        } catch (error) {
            alert("Ошибка при удалении");
        }
    };

    return (
        <div className="flex flex-col gap-12">
            <div className="flex items-center justify-between">
                <section>
                    <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">Предметы.</h1>
                    <p className="text-neutral-500 mt-2">Управление корневым уровнем иерархии контента.</p>
                </section>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="bg-neutral-900 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 hover:opacity-90 transition-all shadow-sm"
                >
                    <Plus size={20} />
                    <span>Новый предмет</span>
                </button>
            </div>

            {isAdding && (
                <form onSubmit={handleCreate} className="bg-white border border-neutral-200 rounded-2xl p-8 flex flex-col sm:flex-row gap-6 items-end animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex-1 space-y-2">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Название</label>
                        <input
                            value={name} onChange={e => setName(e.target.value)} required
                            className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-3 focus:outline-none focus:border-neutral-900"
                            placeholder="Физика"
                        />
                    </div>
                    <div className="w-24 space-y-2">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Эмодзи</label>
                        <input
                            value={emoji} onChange={e => setEmoji(e.target.value)} required
                            className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-3 text-center text-xl focus:outline-none focus:border-neutral-900"
                            placeholder="⚛️"
                        />
                    </div>
                    <button type="submit" className="bg-neutral-900 text-white px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-all">
                        Добавить
                    </button>
                </form>
            )}

            <section className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-neutral-50/50 border-b border-neutral-100">
                        <tr>
                            <th className="px-8 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest">Предмет</th>
                            <th className="px-8 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest text-right">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {isLoading ? (
                            [1, 2, 3].map(i => <tr key={i} className="h-20 animate-pulse bg-neutral-50/20" />)
                        ) : subjects.length > 0 ? (
                            subjects.map(subject => (
                                <tr key={subject.id} className="hover:bg-neutral-50/30 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <span className="text-3xl">{subject.emoji}</span>
                                            <span className="font-semibold text-neutral-900 tracking-tight">{subject.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button className="p-2 text-neutral-400 hover:text-neutral-900 transition-colors"><Edit2 size={18} /></button>
                                            <button onClick={() => handleDelete(subject.id)} className="p-2 text-neutral-400 hover:text-red-600 transition-colors"><Trash2 size={18} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={2} className="px-8 py-12 text-center text-neutral-400 font-medium">Предметы не найдены.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
