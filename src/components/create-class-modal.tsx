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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-lg rounded-[2rem] bg-white/5 border border-white/15 shadow-[0_0_40px_rgba(0,0,0,0.6)] overflow-hidden animate-in fade-in zoom-in duration-200 backdrop-blur-2xl">
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

                <div className="relative z-10 p-8 md:p-10">
                    <h2 className="text-2xl font-bold text-white tracking-tight mb-6">
                        Новый класс
                    </h2>

                    <form onSubmit={handleSubmit} className="space-y-7">
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-white/70 uppercase tracking-[0.2em] ml-1">
                                Название класса
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={'Например, 10 "Б" Математика'}
                                className="w-full rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:bg-white/10 focus:border-white/40 focus:outline-none transition-all"
                                required
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-white/70 uppercase tracking-[0.2em] ml-1">
                                Предмет
                            </label>
                            <div className="grid grid-cols-2 gap-3 max-h-52 overflow-y-auto pr-1">
                                {SUBJECTS.map((s) => {
                                    const isActive = subjectId === s.id;
                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => setSubjectId(s.id)}
                                            className={`flex flex-col items-start gap-1.5 p-3 rounded-2xl border text-left text-xs transition-all backdrop-blur ${
                                                isActive
                                                    ? "border-white bg-white/15 text-white shadow-[0_0_25px_rgba(0,0,0,0.5)]"
                                                    : "border-white/15 bg-white/5 text-white/80 hover:border-white/35 hover:bg-white/10"
                                            }`}
                                        >
                                            <span className="text-lg">{s.emoji}</span>
                                            <span className="font-semibold text-[11px] uppercase tracking-[0.16em]">
                                                {s.name}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 rounded-2xl border border-white/20 text-white/70 font-medium hover:bg-white/5 transition-all text-sm"
                            >
                                Отмена
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 py-3 rounded-2xl bg-white text-neutral-900 font-semibold text-sm hover:bg-neutral-100 active:scale-[0.97] transition-all disabled:opacity-50 shadow-[0_12px_35px_rgba(0,0,0,0.55)]"
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

