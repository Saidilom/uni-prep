"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { adminFetchCollection, adminAddItem, adminDeleteItem, adminIncrementField } from "@/lib/admin-utils";
import { Question, Topic, Textbook, Subject } from "@/lib/firestore-schema";
import { Plus, Trash2, BookOpen, Layers, ImagePlus, X, Loader2 } from "lucide-react";
import { fetchTextbooksBySubject, fetchTopicsByTextbook, fetchQuestionsByTopic, fetchTopicsBySubject } from "@/lib/data-fetching";
import { uploadToUploadcare } from "@/lib/uploadcare";
import QuillEditor from "@/components/QuillEditor";
import MathInput from "@/components/MathInput";
import MathText from "@/components/MathText";

type Mode = "textbook" | "direct";

export default function AdminQuestionsPage() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [textbooks, setTextbooks] = useState<Textbook[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [questions, setQuestions] = useState<Question[]>([]);

    const [mode, setMode] = useState<Mode>("textbook");
    const [selectedSubject, setSelectedSubject] = useState("");
    const [selectedTextbook, setSelectedTextbook] = useState("");
    const [selectedTopic, setSelectedTopic] = useState("");

    const [isAdding, setIsAdding] = useState(false);

    // Form
    const [text, setText] = useState("");
    const [optionA, setOptionA] = useState("");
    const [optionB, setOptionB] = useState("");
    const [optionC, setOptionC] = useState("");
    const [optionD, setOptionD] = useState("");
    const [correctAnswer, setCorrectAnswer] = useState<"a" | "b" | "c" | "d">("a");
    const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("easy");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState("");
    const [imageUploading, setImageUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        adminFetchCollection("subjects", "name").then((data) => {
            const nextSubjects = (data as Array<Record<string, unknown>>).map((item) => ({
                id: String(item.id ?? ""),
                name: String(item.name ?? ""),
                emoji: String(item.emoji ?? ""),
                color: String(item.color ?? ""),
                order: Number(item.order ?? 0),
            })) as Subject[];
            setSubjects(nextSubjects);
        });
    }, []);

    const switchMode = (m: Mode) => {
        setMode(m);
        setSelectedSubject("");
        setSelectedTextbook("");
        setSelectedTopic("");
        setTopics([]);
        setQuestions([]);
        setIsAdding(false);
    };

    useEffect(() => {
        if (!selectedSubject) return;
        setSelectedTextbook("");
        setSelectedTopic("");
        setTopics([]);
        setQuestions([]);
        if (mode === "textbook") {
            fetchTextbooksBySubject(selectedSubject).then(setTextbooks);
        } else {
            fetchTopicsBySubject(selectedSubject).then(topics => {
                setTopics(topics);
            });
        }
    }, [selectedSubject, mode]);

    useEffect(() => {
        if (mode !== "textbook" || !selectedTextbook) return;
        fetchTopicsByTextbook(selectedTextbook).then(setTopics);
        setSelectedTopic("");
        setQuestions([]);
    }, [selectedTextbook, mode]);

    useEffect(() => {
        if (selectedTopic) {
            fetchQuestionsByTopic(selectedTopic).then(setQuestions);
        }
    }, [selectedTopic]);

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

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTopic) return;
        setImageUploading(true);
        try {
            // Upload to Uploadcare only on submit
            let uploadedUrl = "";
            if (imageFile) {
                uploadedUrl = await uploadToUploadcare(imageFile);
            }

            const newQuestion: Record<string, unknown> = {
                text,
                topicId: selectedTopic,
                options: { a: optionA, b: optionB, c: optionC, d: optionD },
                correctAnswer,
                difficulty,
            };
            if (uploadedUrl) newQuestion.imageUrl = uploadedUrl;
            const created = await adminAddItem("questions", newQuestion);
            const nextQuestion = {
                id: String(created.id ?? ""),
                topicId: String(created.topicId ?? selectedTopic),
                text: String(created.text ?? ""),
                options: (created.options as Record<string, string>) ?? { a: "", b: "", c: "", d: "" },
                correctAnswer: (created.correctAnswer as "a" | "b" | "c" | "d") ?? "a",
                difficulty: (created.difficulty as "easy" | "medium" | "hard") ?? "easy",
                imageUrl: created.imageUrl ? String(created.imageUrl) : undefined,
            } as Question;
            setQuestions(prev => [nextQuestion, ...prev]);
            await adminIncrementField("topics", selectedTopic, "totalQuestions", 1);

            // Clear form
            setText("");
            setOptionA("");
            setOptionB("");
            setOptionC("");
            setOptionD("");
            clearImage();
            setIsAdding(false);
        } catch {
            alert("Ошибка при добавлении вопроса");
        } finally {
            setImageUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Вы уверены?")) return;
        try {
            const q = questions.find(q => q.id === id);
            await adminDeleteItem("questions", id);
            setQuestions(prev => prev.filter(q => q.id !== id));
            if (q?.topicId) await adminIncrementField("topics", q.topicId, "totalQuestions", -1);
        } catch {
            alert("Ошибка при удалении");
        }
    };

    const topicDisabled = mode === "textbook" ? !selectedTextbook : !selectedSubject;

    return (
        <div className="flex flex-col gap-12">
            <div className="flex items-center justify-between">
                <section>
                    <h1 className="text-4xl font-semibold tracking-tight text-foreground">Вопросы.</h1>
                    <p className="text-muted-foreground mt-2">Создание и управление вопросами викторины для каждой темы.</p>
                </section>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    disabled={!selectedTopic}
                    className="bg-foreground text-background px-6 py-3 rounded-xl font-medium flex items-center gap-2 hover:opacity-90 disabled:opacity-30 transition-all shadow-sm"
                >
                    <Plus size={20} />
                    <span>Новый вопрос</span>
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

            {/* Selection Filters */}
            <section className={`grid grid-cols-1 gap-6 bg-card border border-border rounded-2xl p-6 ${
                mode === "textbook" ? "md:grid-cols-3" : "md:grid-cols-2"
            }`}>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Предмет</label>
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
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Учебник</label>
                        <select
                            value={selectedTextbook}
                            onChange={e => setSelectedTextbook(e.target.value)}
                            disabled={!selectedSubject}
                            className="w-full bg-muted border border-border rounded-lg p-3 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 appearance-none disabled:opacity-50"
                        >
                            <option value="">Выберите учебник</option>
                            {textbooks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                        </select>
                    </div>
                )}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Тема</label>
                    <select
                        value={selectedTopic}
                        onChange={e => setSelectedTopic(e.target.value)}
                        disabled={topicDisabled}
                        className="w-full bg-muted border border-border rounded-lg p-3 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 appearance-none disabled:opacity-50"
                    >
                        <option value="">Выберите тему</option>
                        {topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                </div>
            </section>

            {isAdding && (
                <form onSubmit={handleCreate} className="bg-card border border-border rounded-2xl p-8 space-y-8 animate-in fade-in slide-in-from-top-4 duration-300">
                    {/* Question text */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Текст вопроса</label>
                        <QuillEditor
                            value={text}
                            onChange={setText}
                            placeholder="Как называется столица Франции?"
                        />
                    </div>

                    {/* Image upload */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Изображение (необязательно)</label>
                        {imagePreview ? (
                            <div className="flex flex-col gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={imagePreview}
                                    alt="preview"
                                    style={{ display: "block", maxHeight: 220, maxWidth: "100%", objectFit: "contain", borderRadius: "0.75rem", border: "1px solid hsl(var(--border))", background: "hsl(var(--muted))" }}
                                />
                                <button
                                    type="button"
                                    onClick={clearImage}
                                    className="flex items-center gap-1.5 w-fit text-sm text-red-500 hover:text-red-600 transition-colors"
                                >
                                    <X size={14} /> Удалить изображение
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={imageUploading}
                                className="flex items-center gap-2 px-4 py-2.5 bg-muted border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all disabled:opacity-50"
                            >
                                {imageUploading ? (
                                    <><Loader2 size={16} className="animate-spin" /> Загрузка...</>
                                ) : (
                                    <><ImagePlus size={16} /> Добавить изображение</>
                                )}
                            </button>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageSelect}
                            className="hidden"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Варианты ответов</label>
                            {["a", "b", "c", "d"].map((opt) => (
                                <div key={opt} className="flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-full border border-border flex items-center justify-center font-bold uppercase text-muted-foreground">{opt}</span>
                                     <MathInput
                                        value={opt === "a" ? optionA : opt === "b" ? optionB : opt === "c" ? optionC : optionD}
                                        onChange={v => {
                                            if (opt === "a") setOptionA(v);
                                            else if (opt === "b") setOptionB(v);
                                            else if (opt === "c") setOptionC(v);
                                            else setOptionD(v);
                                        }}
                                        className="flex-1"
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Правильный ответ</label>
                                <select
                                    value={correctAnswer}
                                    onChange={e => setCorrectAnswer(e.target.value as "a" | "b" | "c" | "d")}
                                    className="w-full bg-muted border border-border rounded-lg p-3 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                                >
                                    <option value="a">Вариант A</option>
                                    <option value="b">Вариант B</option>
                                    <option value="c">Вариант C</option>
                                    <option value="d">Вариант D</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Сложность</label>
                                <select
                                    value={difficulty}
                                    onChange={e => setDifficulty(e.target.value as "easy" | "medium" | "hard")}
                                    className="w-full bg-muted border border-border rounded-lg p-3 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                                >
                                    <option value="easy">Простой</option>
                                    <option value="medium">Средний</option>
                                    <option value="hard">Сложный</option>
                                </select>
                            </div>
                            <div className="pt-4">
                                <button type="submit" disabled={imageUploading} className="w-full bg-foreground text-background py-4 rounded-xl font-semibold hover:opacity-90 disabled:opacity-60 transition-all shadow-md flex items-center justify-center gap-2">
                                    {imageUploading && <Loader2 size={18} className="animate-spin" />}
                                    {imageUploading ? "Загрузка изображения..." : "Добавить вопрос"}
                                </button>
                            </div>
                        </div>
                    </div>
                </form>
            )}

            <section className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="p-8 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Список вопросов</h2>
                    <span className="text-sm text-muted-foreground font-medium">{questions.length} всего</span>
                </div>
                <div className="divide-y divide-border">
                    {questions.length > 0 ? (
                        questions.map(q => (
                            <div key={q.id} className="p-8 hover:bg-muted/50 transition-colors group">
                                <div className="flex items-start justify-between gap-6">
                                    <div className="flex-1 space-y-4">
                                        <div className="flex items-center gap-3">
                                            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-muted ${q.difficulty === "easy" ? "text-green-600" :
                                                q.difficulty === "medium" ? "text-orange-600" : "text-red-600"
                                                }`}>
                                                {q.difficulty === "easy" ? "Простой" : q.difficulty === "medium" ? "Средний" : "Сложный"}
                                            </span>
                                            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Правильно: {q.correctAnswer.toUpperCase()}</span>
                                        </div>
                                        {q.imageUrl && (
                                            <Image src={q.imageUrl} alt="" width={400} height={128} className="max-h-32 rounded-lg object-contain border border-border" />
                                        )}
                                        <MathText
                                            content={q?.text ?? ""}
                                            className="text-lg font-medium text-foreground leading-relaxed mb-6 ql-content math-question-text"
                                        />
                                        <div className="grid grid-cols-2 gap-4">
                                            {Object.entries(q.options).map(([key, val]) => (
                                                 <div key={key} className={`rounded-lg border p-3 text-sm ${key === q.correctAnswer ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-border text-muted-foreground"}`}>
                                                    <span className="font-bold mr-2">{key.toUpperCase()}:</span>
                                                    <MathText content={val} as="span" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <button onClick={() => handleDelete(q.id)} className="p-2 text-muted-foreground/70 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100">
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="px-8 py-24 text-center text-muted-foreground font-medium italic">
                            {!selectedTopic ? "Выберите тему для управления ее вопросами." : "Вопросы для этой темы не найдены."}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
