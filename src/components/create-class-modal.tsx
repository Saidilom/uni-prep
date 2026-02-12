"use client";

import { useState } from "react";
import { SUBJECTS } from "@/lib/constants";

interface CreateClassModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: (name: string, subjectId: string) => Promise<void>;
}

export default function CreateClassModal({ isOpen, onClose, onCreated }: CreateClassModalProps) {
    const [name, setName] = useState("");
    const [subjectId, setSubjectId] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !subjectId) return;
        setIsSubmitting(true);
        try {
            await onCreated(name, subjectId);
            setName("");
            setSubjectId("");
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-8">
                    <h2 className="text-2xl font-semibold text-neutral-900 tracking-tight mb-6">Создание нового класса.</h2>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-2">Название класса</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Напр. 10 'Б' Математика"
                                className="w-full rounded-lg border border-neutral-200 p-3 bg-white focus:border-neutral-900 focus:outline-none transition-colors"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-2">Предмет</label>
                            <select
                                value={subjectId}
                                onChange={(e) => setSubjectId(e.target.value)}
                                className="w-full rounded-lg border border-neutral-200 p-3 bg-white focus:border-neutral-900 focus:outline-none transition-colors"
                                required
                            >
                                <option value="">Выберите предмет</option>
                                {SUBJECTS.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.emoji} {s.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 border border-neutral-200 text-neutral-600 rounded-lg font-medium hover:bg-neutral-50 transition-colors"
                            >
                                Отмена
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 py-3 bg-neutral-900 text-white rounded-lg font-medium hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                {isSubmitting ? "Создание..." : "Создать класс"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
