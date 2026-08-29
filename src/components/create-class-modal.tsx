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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm dark:bg-black/70">
            <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card shadow-lg animate-in fade-in zoom-in duration-200">
                <div className="p-8 md:p-10">
                    <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground">Новая группа</h2>

                    <form onSubmit={handleSubmit} className="space-y-7">
                        <div className="space-y-2">
                            <label className="ml-1 block text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                                Название группы
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={'Например, 10 "Б" Математика'}
                                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-border focus:outline-none focus:ring-2 focus:ring-ring/30"
                                required
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="ml-1 block text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                                Предмет
                            </label>
                            <div className="grid max-h-52 grid-cols-2 gap-3 overflow-y-auto pr-1">
                                {SUBJECTS.map((s) => {
                                    const isActive = subjectId === s.id;
                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => setSubjectId(s.id)}
                                            className={`flex flex-col items-start gap-1.5 rounded-2xl border-2 p-3 text-left text-xs transition-all ${
                                                isActive
                                                    ? "border-foreground/80 bg-muted shadow-sm"
                                                    : "border-border bg-card hover:border-border hover:bg-muted/60"
                                            }`}
                                        >
                                            <span className="text-lg">{s.emoji}</span>
                                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
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
                                className="flex-1 rounded-2xl border border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                            >
                                Отмена
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 rounded-2xl bg-foreground py-3 text-sm font-semibold text-background transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                            >
                                {isSubmitting ? "Создание..." : "Создать группу"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
