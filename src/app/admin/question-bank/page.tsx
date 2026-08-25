"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Plus, Trash2, Edit3, Save, X, Search, Copy, ImagePlus, Loader2, Upload } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { SUBJECTS } from "@/lib/constants";
import { uploadToUploadcare } from "@/lib/uploadcare";
import QuestionBankJsonImport from "@/components/question-bank-json-import";

type Difficulty = "easy" | "medium" | "hard";

type BankRow = {
    id: string;
    text: string;
    options: Record<string, string>;
    correct_answer: string;
    points: number;
    subject: string | null;
    topic: string | null;
    difficulty: Difficulty;
    image_url: string | null;
    created_at: string;
};

type Form = {
    id?: string;
    text: string;
    options: Record<string, string>;
    correct_answer: string;
    points: number;
    subject: string;
    topic: string;
    difficulty: Difficulty;
    imageUrl: string;
};

const difficultyLabel: Record<Difficulty, string> = { easy: "Простой", medium: "Средний", hard: "Сложный" };

const emptyForm = (): Form => ({
    text: "",
    options: { a: "", b: "", c: "", d: "" },
    correct_answer: "a",
    points: 1,
    subject: "",
    topic: "",
    difficulty: "medium",
    imageUrl: "",
});

export default function AdminQuestionBankPage() {
    const [items, setItems] = useState<BankRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Form | null>(null);
    const [saving, setSaving] = useState(false);
    const [showImport, setShowImport] = useState(false);

    const [query, setQuery] = useState("");
    const [subjectFilter, setSubjectFilter] = useState("");
    const [topicFilter, setTopicFilter] = useState("");
    const [difficultyFilter, setDifficultyFilter] = useState("");

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState("");
    const [imageUploading, setImageUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const load = async () => {
        setLoading(true);
        const { data } = await supabase.from("question_bank").select("*").order("created_at", { ascending: false });
        if (data) setItems(data as BankRow[]);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

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

    const startCreate = () => {
        setEditing(emptyForm());
        clearImage();
    };

    const startEdit = (row: BankRow) => {
        setEditing({
            id: row.id,
            text: row.text,
            options: row.options,
            correct_answer: row.correct_answer,
            points: row.points,
            subject: row.subject || "",
            topic: row.topic || "",
            difficulty: row.difficulty,
            imageUrl: row.image_url || "",
        });
        clearImage();
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const clearImage = () => {
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImageFile(null);
        setImagePreview("");
    };

    const save = async () => {
        if (!editing) return;
        setSaving(true);
        try {
            let imageUrl = editing.imageUrl;
            if (imageFile) {
                setImageUploading(true);
                try {
                    imageUrl = await uploadToUploadcare(imageFile);
                } catch {
                    alert("Не удалось загрузить изображение");
                    return;
                } finally {
                    setImageUploading(false);
                }
            }

            const row = {
                text: editing.text,
                options: editing.options,
                correct_answer: editing.correct_answer,
                points: editing.points,
                subject: editing.subject || null,
                topic: editing.topic.trim() || null,
                difficulty: editing.difficulty,
                image_url: imageUrl || null,
                updated_at: new Date().toISOString(),
            };

            if (editing.id) {
                const { error } = await supabase.from("question_bank").update(row).eq("id", editing.id);
                if (error) { alert(`Не удалось сохранить: ${error.message}`); return; }
            } else {
                const { error } = await supabase.from("question_bank").insert({ id: crypto.randomUUID(), ...row });
                if (error) { alert(`Не удалось создать: ${error.message}`); return; }
            }
            setEditing(null);
            clearImage();
            load();
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        if (!confirm("Удалить этот вопрос из банка? Уже добавленные копии в тестах не пострадают.")) return;
        await supabase.from("question_bank").delete().eq("id", id);
        load();
    };

    const duplicate = async (row: BankRow) => {
        const { error } = await supabase.from("question_bank").insert({
            id: crypto.randomUUID(),
            text: `${row.text} (копия)`,
            options: row.options,
            correct_answer: row.correct_answer,
            points: row.points,
            subject: row.subject,
            topic: row.topic,
            difficulty: row.difficulty,
            image_url: row.image_url,
        });
        if (error) { alert(`Не удалось дублировать: ${error.message}`); return; }
        load();
    };

    return (
        <div className="flex flex-col gap-10">
            <section className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Банк вопросов</h1>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                        Единый переиспользуемый банк вопросов с тегами предмет/тема/сложность. Добавляйте вопросы сюда, затем подбирайте их в Placement и Mock-тестах.
                    </p>
                </div>
                {!editing && (
                    <div className="flex items-center gap-3">
                        <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-2 rounded-2xl border border-border px-5 py-3 text-sm font-semibold hover:bg-muted transition-colors">
                            <Upload size={18} /> Импорт из JSON
                        </button>
                        <button onClick={startCreate} className="inline-flex items-center gap-2 rounded-2xl bg-foreground px-5 py-3 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97]">
                            <Plus size={18} /> Новый вопрос
                        </button>
                    </div>
                )}
            </section>

            {showImport && <QuestionBankJsonImport onDone={() => load()} onClose={() => setShowImport(false)} />}

            {editing && (
                <div className="rounded-3xl border border-border bg-card p-8 space-y-6">
                    <div className="space-y-1.5">
                        <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Текст вопроса</label>
                        <textarea value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground" rows={2} />
                    </div>

                    <div className="space-y-3">
                        <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Изображение (необязательно)</label>
                        {(imagePreview || editing.imageUrl) ? (
                            <div className="flex flex-col gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={imagePreview || editing.imageUrl}
                                    alt="preview"
                                    style={{ display: "block", maxHeight: 200, maxWidth: "100%", objectFit: "contain", borderRadius: "0.75rem", border: "1px solid hsl(var(--border))", background: "hsl(var(--muted))" }}
                                />
                                <button type="button" onClick={() => { clearImage(); setEditing({ ...editing, imageUrl: "" }); }} className="flex items-center gap-1.5 w-fit text-sm text-red-500 hover:text-red-600 transition-colors">
                                    <X size={14} /> Удалить изображение
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={imageUploading} className="flex items-center gap-2 px-4 py-2.5 bg-muted border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all disabled:opacity-50">
                                {imageUploading ? <><Loader2 size={16} className="animate-spin" /> Загрузка...</> : <><ImagePlus size={16} /> Добавить изображение</>}
                            </button>
                        )}
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {["a", "b", "c", "d"].map((key) => (
                            <div key={key} className="space-y-1.5">
                                <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Вариант {key.toUpperCase()}</label>
                                <input value={editing.options[key] || ""} onChange={(e) => setEditing({ ...editing, options: { ...editing.options, [key]: e.target.value } })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground" />
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Правильный ответ</label>
                            <select value={editing.correct_answer} onChange={(e) => setEditing({ ...editing, correct_answer: e.target.value })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground">
                                <option value="a">A</option><option value="b">B</option><option value="c">C</option><option value="d">D</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Баллы</label>
                            <input type="number" value={editing.points} onChange={(e) => setEditing({ ...editing, points: Number(e.target.value) })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Предмет</label>
                            <select value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground">
                                <option value="">—</option>
                                {SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Сложность</label>
                            <select value={editing.difficulty} onChange={(e) => setEditing({ ...editing, difficulty: e.target.value as Difficulty })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground">
                                <option value="easy">Простой</option>
                                <option value="medium">Средний</option>
                                <option value="hard">Сложный</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Тема (свободный текст)</label>
                        <input value={editing.topic} onChange={(e) => setEditing({ ...editing, topic: e.target.value })} placeholder="Например: Уравнения, Даты, Present Simple…" className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground" />
                    </div>

                    <div className="flex items-center gap-3">
                        <button onClick={save} disabled={saving || imageUploading || !editing.text.trim()} className="inline-flex items-center gap-2 rounded-2xl bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50">
                            <Save size={18} /> {saving ? "Сохранение…" : "Сохранить"}
                        </button>
                        <button onClick={() => { setEditing(null); clearImage(); }} className="inline-flex items-center gap-2 rounded-2xl border border-border px-6 py-3 text-sm font-semibold hover:bg-muted transition-colors"><X size={18} /> Отмена</button>
                    </div>
                </div>
            )}

            <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6">
                <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по тексту вопроса…" className="w-full rounded-2xl border border-border bg-background pl-10 pr-4 py-3 text-sm text-foreground" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground">
                        <option value="">Все предметы</option>
                        {SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground">
                        <option value="">Все темы</option>
                        {topics.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground">
                        <option value="">Любая сложность</option>
                        <option value="easy">Простой</option>
                        <option value="medium">Средний</option>
                        <option value="hard">Сложный</option>
                    </select>
                </div>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => <div key={n} className="h-24 animate-pulse rounded-2xl border border-border bg-muted" />)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">{items.length === 0 ? "Банк пока пуст." : "Ничего не найдено по этим фильтрам."}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((q) => {
                            const subjectName = SUBJECTS.find((s) => s.id === q.subject)?.name;
                            return (
                                <div key={q.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:bg-muted/40 sm:flex-row sm:items-center">
                                    <div className="min-w-0 flex-1 flex items-start gap-4">
                                        {q.image_url && (
                                            <Image src={q.image_url} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-lg object-cover border border-border" />
                                        )}
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-foreground">{q.text}</p>
                                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                                <span>{subjectName || "Без предмета"}</span>
                                                {q.topic && <><span>•</span><span>{q.topic}</span></>}
                                                <span>•</span>
                                                <span className={q.difficulty === "easy" ? "text-green-600" : q.difficulty === "medium" ? "text-orange-600" : "text-red-600"}>{difficultyLabel[q.difficulty]}</span>
                                                <span>•</span>
                                                <span>Правильно: {q.correct_answer.toUpperCase()}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button onClick={() => duplicate(q)} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-muted transition-colors"><Copy size={16} /> Дублировать</button>
                                        <button onClick={() => startEdit(q)} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-muted transition-colors"><Edit3 size={16} /> Изменить</button>
                                        <button onClick={() => remove(q.id)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100 transition-colors"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
