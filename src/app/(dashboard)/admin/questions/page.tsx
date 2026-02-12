"use client";

import { useEffect, useState } from "react";
import { adminFetchCollection, adminAddItem, adminDeleteItem } from "@/lib/admin-utils";
import { Question, Topic, Textbook, Subject } from "@/lib/firestore-schema";
import { Plus, Trash2, HelpCircle } from "lucide-react";
import { fetchTextbooksBySubject, fetchTopicsByTextbook, fetchQuestionsByTopic } from "@/lib/data-fetching";

export default function AdminQuestionsPage() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [textbooks, setTextbooks] = useState<Textbook[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [questions, setQuestions] = useState<Question[]>([]);

    const [selectedSubject, setSelectedSubject] = useState("");
    const [selectedTextbook, setSelectedTextbook] = useState("");
    const [selectedTopic, setSelectedTopic] = useState("");

    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

    // Форма
    const [text, setText] = useState("");
    const [optionA, setOptionA] = useState("");
    const [optionB, setOptionB] = useState("");
    const [optionC, setOptionC] = useState("");
    const [optionD, setOptionD] = useState("");
    const [correctAnswer, setCorrectAnswer] = useState<"a" | "b" | "c" | "d">("a");
    const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("easy");

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
            setSelectedTopic("");
            setQuestions([]);
        }
    }, [selectedSubject]);

    useEffect(() => {
        if (selectedTextbook) {
            fetchTopicsByTextbook(selectedTextbook).then(setTopics);
            setSelectedTopic("");
            setQuestions([]);
        }
    }, [selectedTextbook]);

    useEffect(() => {
        if (selectedTopic) {
            fetchQuestionsByTopic(selectedTopic).then(setQuestions);
        }
    }, [selectedTopic]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTopic) return;
        try {
            const newQuestion = {
                text,
                topicId: selectedTopic,
                options: { a: optionA, b: optionB, c: optionC, d: optionD },
                correctAnswer,
                difficulty
            };
            const created = await adminAddItem("questions", newQuestion);
            setQuestions(prev => [created as Question, ...prev]);

            // Clear form
            setText("");
            setOptionA("");
            setOptionB("");
            setOptionC("");
            setOptionD("");
            setIsAdding(false);
        } catch (error) {
            alert("Ошибка при добавлении вопроса");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Вы уверены?")) return;
        try {
            await adminDeleteItem("questions", id);
            setQuestions(prev => prev.filter(q => q.id !== id));
        } catch (error) {
            alert("Ошибка при удалении");
        }
    };

    return (
        <div className="flex flex-col gap-12">
            <div className="flex items-center justify-between">
                <section>
                    <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">Вопросы.</h1>
                    <p className="text-neutral-500 mt-2">Создание и управление вопросами викторины для каждой темы.</p>
                </section>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    disabled={!selectedTopic}
                    className="bg-neutral-900 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 hover:opacity-90 disabled:opacity-30 transition-all shadow-sm"
                >
                    <Plus size={20} />
                    <span>Новый вопрос</span>
                </button>
            </div>

            {/* Selection Filters */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white border border-neutral-200 rounded-2xl p-6">
                <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Предмет</label>
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
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Учебник</label>
                    <select
                        value={selectedTextbook}
                        onChange={e => setSelectedTextbook(e.target.value)}
                        disabled={!selectedSubject}
                        className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-3 focus:outline-none focus:border-neutral-900 appearance-none disabled:opacity-50"
                    >
                        <option value="">Выберите учебник</option>
                        {textbooks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Тема</label>
                    <select
                        value={selectedTopic}
                        onChange={e => setSelectedTopic(e.target.value)}
                        disabled={!selectedTextbook}
                        className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-3 focus:outline-none focus:border-neutral-900 appearance-none disabled:opacity-50"
                    >
                        <option value="">Выберите тему</option>
                        {topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                </div>
            </section>

            {isAdding && (
                <form onSubmit={handleCreate} className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-8 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Текст вопроса</label>
                        <textarea
                            value={text} onChange={e => setText(e.target.value)} required
                            className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-4 h-32 focus:outline-none focus:border-neutral-900"
                            placeholder="Как называется столица Франции?"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Варианты ответов</label>
                            {["a", "b", "c", "d"].map((opt) => (
                                <div key={opt} className="flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-full border border-neutral-200 flex items-center justify-center font-bold uppercase text-neutral-400">{opt}</span>
                                    <input
                                        value={opt === "a" ? optionA : opt === "b" ? optionB : opt === "c" ? optionC : optionD}
                                        onChange={e => {
                                            if (opt === "a") setOptionA(e.target.value);
                                            else if (opt === "b") setOptionB(e.target.value);
                                            else if (opt === "c") setOptionC(e.target.value);
                                            else setOptionD(e.target.value);
                                        }}
                                        required
                                        className="flex-1 bg-neutral-50 border border-neutral-100 rounded-lg p-3 focus:outline-none focus:border-neutral-900"
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Правильный ответ</label>
                                <select
                                    value={correctAnswer}
                                    onChange={e => setCorrectAnswer(e.target.value as any)}
                                    className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-3 focus:outline-none focus:border-neutral-900"
                                >
                                    <option value="a">Вариант A</option>
                                    <option value="b">Вариант B</option>
                                    <option value="c">Вариант C</option>
                                    <option value="d">Вариант D</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Сложность</label>
                                <select
                                    value={difficulty}
                                    onChange={e => setDifficulty(e.target.value as any)}
                                    className="w-full bg-neutral-50 border border-neutral-100 rounded-lg p-3 focus:outline-none focus:border-neutral-900"
                                >
                                    <option value="easy">Простой</option>
                                    <option value="medium">Средний</option>
                                    <option value="hard">Сложный</option>
                                </select>
                            </div>
                            <div className="pt-4">
                                <button type="submit" className="w-full bg-neutral-900 text-white py-4 rounded-xl font-semibold hover:opacity-90 transition-all shadow-md">
                                    Добавить вопрос
                                </button>
                            </div>
                        </div>
                    </div>
                </form>
            )}

            <section className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-8 border-b border-neutral-100 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-neutral-900 tracking-tight">Список вопросов</h2>
                    <span className="text-sm text-neutral-400 font-medium">{questions.length} всего</span>
                </div>
                <div className="divide-y divide-neutral-100">
                    {questions.length > 0 ? (
                        questions.map(q => (
                            <div key={q.id} className="p-8 hover:bg-neutral-50/50 transition-colors group">
                                <div className="flex items-start justify-between gap-6">
                                    <div className="flex-1 space-y-4">
                                        <div className="flex items-center gap-3">
                                            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-neutral-100 ${q.difficulty === "easy" ? "text-green-600" :
                                                q.difficulty === "medium" ? "text-orange-600" : "text-red-600"
                                                }`}>
                                                {q.difficulty === "easy" ? "Простой" : q.difficulty === "medium" ? "Средний" : "Сложный"}
                                            </span>
                                            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Правильно: {q.correctAnswer.toUpperCase()}</span>
                                        </div>
                                        <p className="text-lg font-medium text-neutral-900 leading-relaxed">{q.text}</p>
                                        <div className="grid grid-cols-2 gap-4">
                                            {Object.entries(q.options).map(([key, val]) => (
                                                <div key={key} className={`text-sm p-3 rounded-lg border ${key === q.correctAnswer ? "border-green-200 bg-green-50 text-green-700" : "border-neutral-100 text-neutral-500"}`}>
                                                    <span className="font-bold mr-2">{key.toUpperCase()}:</span> {val}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <button onClick={() => handleDelete(q.id)} className="p-2 text-neutral-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100">
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="px-8 py-24 text-center text-neutral-400 font-medium italic">
                            {!selectedTopic ? "Выберите тему для управления ее вопросами." : "Вопросы для этой темы не найдены."}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
