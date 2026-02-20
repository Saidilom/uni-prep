"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Question, Topic, Medal } from "@/lib/firestore-schema";
import { fetchTopicById, fetchQuestionsByTopic, fetchTopicsByTextbook } from "@/lib/data-fetching";
import { useAuthStore } from "@/store/useAuthStore";
import { db } from "@/lib/firebase";
import { doc, setDoc, updateDoc, increment, serverTimestamp, collection, addDoc, getDoc, getDocs } from "firebase/firestore";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle, RefreshCw, Home, Award, Medal as MedalIcon, ShieldCheck, AlertCircle } from "lucide-react";
import { getMedalByErrors } from "@/lib/constants";
import Plasma from "@/components/Plasma";

export default function TestPage() {
    const { id } = useParams();
    const router = useRouter();
    const { user } = useAuthStore();

    const [topic, setTopic] = useState<Topic | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [isAnswered, setIsAnswered] = useState(false);
    const [results, setResults] = useState({ correct: 0, errors: 0 });
    const [isFinished, setIsFinished] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (id) {
            Promise.all([
                fetchTopicById(id as string),
                fetchQuestionsByTopic(id as string)
            ]).then(([topicData, questionsData]) => {
                setTopic(topicData);
                setQuestions(questionsData);
                setIsLoading(false);
            });
        }
    }, [id]);

    const resetTest = () => {
        setCurrentIdx(0);
        setSelectedAnswer(null);
        setIsAnswered(false);
        setResults({ correct: 0, errors: 0 });
        setIsFinished(false);
    };

    const handleAnswer = (option: string) => {
        if (isAnswered) return;

        const correct = option === questions[currentIdx].correctAnswer;
        setSelectedAnswer(option);
        setIsAnswered(true);

        if (correct) {
            setResults(prev => ({ ...prev, correct: prev.correct + 1 }));
        } else {
            setResults(prev => ({ ...prev, errors: prev.errors + 1 }));
        }

        setTimeout(() => {
            if (currentIdx < questions.length - 1) {
                setCurrentIdx(prev => prev + 1);
                setSelectedAnswer(null);
                setIsAnswered(false);
            } else {
                finishTest();
            }
        }, 1500);
    };

    const finishTest = async () => {
        setIsFinished(true);
        if (!user || !topic) return;

        const accuracy = Math.round((results.correct / questions.length) * 100);
        const medal = getMedalByErrors(results.errors, 1); // logic from constants

        // 1. Update userProgress
        const progressRef = doc(db, "users", user.id, "userProgress", topic.id);
        await setDoc(progressRef, {
            userId: user.id,
            topicId: topic.id,
            solvedQuestions: results.correct,
            errors: results.errors,
            medal: medal,
            accuracy: accuracy,
            completedAt: new Date().toISOString()
        });

        // 2. Add to testResults (history)
        const historyRef = collection(db, "users", user.id, "testResults");
        await addDoc(historyRef, {
            topicId: topic.id,
            correctAnswers: results.correct,
            errors: results.errors,
            accuracy: accuracy,
            medal: medal,
            completedAt: serverTimestamp()
        });

        // 3. Update subject rating (stars)
        // Note: We need the textbook to get subjectId
        const textbookRef = doc(db, "textbooks", topic.textbookId);
        const textbookSnap = await getDoc(textbookRef);
        if (textbookSnap.exists()) {
            const textbookData = textbookSnap.data();
            const subjectId = textbookData.subjectId;
            const ratingRef = doc(db, "users", user.id, "ratings", subjectId);
            const ratingSnap = await getDoc(ratingRef);

            if (ratingSnap.exists()) {
                await updateDoc(ratingRef, {
                    stars: increment(results.correct),
                    lastUpdated: serverTimestamp()
                });
            } else {
                await setDoc(ratingRef, {
                    userId: user.id,
                    subjectId: subjectId,
                    stars: results.correct,
                    lastUpdated: serverTimestamp()
                });
            }

            // 4. Check for badges
            const topics = await fetchTopicsByTextbook(topic.textbookId);
            const userProgressRef = collection(db, "users", user.id, "userProgress");
            const userProgressSnap = await getDocs(userProgressRef);

            const progressMap: Record<string, any> = {};
            userProgressSnap.forEach(doc => {
                progressMap[doc.id] = doc.data();
            });

            // Проверяем, все ли темы пройдены на зеленую медаль
            // Учитываем текущий результат, так как он мог еще не обновиться в snapshot
            const allGreen = topics.every(t => {
                const m = t.id === topic.id ? medal : progressMap[t.id]?.medal;
                return m === 'green';
            });

            if (allGreen && topics.length > 0) {
                const badgeRef = doc(db, "users", user.id, "badges", topic.textbookId);
                const badgeSnap = await getDoc(badgeRef);

                if (!badgeSnap.exists()) {
                    await setDoc(badgeRef, {
                        name: `Знаток: ${textbookData.title}`,
                        description: "Вы прошли все темы учебника на идеальный результат",
                        textbookId: topic.textbookId,
                        icon: "🏆",
                        unlockedAt: serverTimestamp()
                    });
                }
            }
        }
    };

    if (isLoading) {
        return (
            <div className="relative min-h-screen">
                <div className="fixed inset-0 z-0">
                    <Plasma
                        color="#ffffff"
                        speed={1.0}
                        direction="forward"
                        scale={1.2}
                        opacity={0.9}
                        mouseInteractive={true}
                    />
                </div>
                <div className="relative z-10 flex items-center justify-center h-screen text-white/70 text-sm">
                    Загрузка теста...
                </div>
            </div>
        );
    }

    if (!topic || questions.length === 0) {
        return (
            <div className="relative min-h-screen">
                <div className="fixed inset-0 z-0">
                    <Plasma
                        color="#ffffff"
                        speed={1.0}
                        direction="forward"
                        scale={1.2}
                        opacity={0.9}
                        mouseInteractive={true}
                    />
                </div>
                <div className="relative z-10 py-24 text-center text-white/70">
                    Вопросы не найдены
                </div>
            </div>
        );
    }

    if (isFinished) {
        const medal = getMedalByErrors(results.errors, 1);

        const renderMedalIcon = (type: Medal) => {
            const baseClasses =
                "inline-flex items-center justify-center rounded-full shadow-[0_0_80px_rgba(0,0,0,0.6)]";

            switch (type) {
                case "green":
                    return (
                        <div className={`${baseClasses} w-28 h-28 bg-emerald-500/90 border border-emerald-200/80`}>
                            <ShieldCheck className="w-14 h-14 text-white" />
                        </div>
                    );
                case "grey":
                    return (
                        <div className={`${baseClasses} w-28 h-28 bg-neutral-400/80 border border-white/70`}>
                            <Award className="w-14 h-14 text-white" />
                        </div>
                    );
                case "bronze":
                    return (
                        <div className={`${baseClasses} w-28 h-28 bg-orange-500/90 border border-orange-200`}>
                            <MedalIcon className="w-14 h-14 text-white" />
                        </div>
                    );
                default:
                    return (
                        <div className={`${baseClasses} w-28 h-28 bg-neutral-700/90 border border-white/40`}>
                            <AlertCircle className="w-14 h-14 text-white" />
                        </div>
                    );
            }
        };

        const accuracyPercent = Math.round((results.correct / questions.length) * 100);
        let resultMessage = "Попробуйте ещё раз.";

        if (accuracyPercent >= 87) resultMessage = "Отличный результат";
        else if (accuracyPercent >= 70) resultMessage = "Хорошо, так держать";
        else if (accuracyPercent >= 50) resultMessage = "Неплохо. Попробуй ещё раз.";

        return (
            <div className="relative min-h-screen">
                <div className="fixed inset-0 z-0">
                    <Plasma
                        color="#ffffff"
                        speed={1.0}
                        direction="forward"
                        scale={1.2}
                        opacity={0.9}
                        mouseInteractive={true}
                    />
                </div>
                <div className="relative z-10 max-w-2xl mx-auto py-16 text-center animate-in fade-in zoom-in duration-500 text-white">
                    <div className="mb-8 flex justify-center">
                        {renderMedalIcon(medal)}
                    </div>
                    <h1 className="text-3xl font-bold mb-4">{resultMessage}</h1>

                    <Card className="p-8 mb-8 bg-white/5 border border-white/15 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.45)]">
                        <div className="grid grid-cols-1 gap-6">
                            <div className="flex items-center justify-between">
                                <span className="text-white/60">Точность</span>
                                <span className="text-2xl font-bold text-white">
                                    {Math.round((results.correct / questions.length) * 100)}%
                                </span>
                            </div>
                            <div className="flex items-center justify-between border-t border-white/10 pt-4">
                                <span className="text-white/60">Правильно</span>
                                <span className="font-semibold text-white">
                                    {results.correct} / {questions.length}
                                </span>
                            </div>
                            <div className="flex items-center justify-between border-t border-white/10 pt-4">
                                <span className="text-white/60">Ошибки</span>
                                <span className="font-semibold text-white">
                                    {results.errors}
                                </span>
                            </div>
                        </div>
                    </Card>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Button
                            onClick={() => router.push(`/textbook/${topic.textbookId}`)}
                            className="h-12 text-lg bg-white text-neutral-900 hover:bg-neutral-100"
                        >
                            Вернуться к темам
                        </Button>
                        <Button
                            variant="outline"
                            onClick={resetTest}
                            className="h-12 text-lg border-white/40 bg-transparent text-white hover:border-white hover:bg-white/10 hover:text-white"
                        >
                            <RefreshCw className="mr-2" size={20} /> Пройти ещё раз
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    const currentQuestion = questions[currentIdx];
    const progress = ((currentIdx + 1) / questions.length) * 100;

    return (
        <div className="relative min-h-screen">
            <div className="fixed inset-0 z-0">
                <Plasma
                    color="#ffffff"
                    speed={1.0}
                    direction="forward"
                    scale={1.2}
                    opacity={0.9}
                    mouseInteractive={true}
                />
            </div>

            <div className="relative z-10 max-w-3xl mx-auto py-10">
                {/* Progress Header */}
                <div className="sticky top-0 z-20 mb-10 py-4 bg-black/20 border-b border-white/10 backdrop-blur">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-white/70">
                            Вопрос {currentIdx + 1} из {questions.length}
                        </span>
                        <span className="text-sm font-medium text-white/70">
                            {Math.round(progress)}%
                        </span>
                    </div>
                    <Progress value={progress} className="h-1.5 bg-white/10" />
                </div>

                {/* Question Section */}
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-2xl font-semibold text-white mb-10 leading-relaxed">
                        {currentQuestion.text}
                    </h2>

                    <div className="grid grid-cols-1 gap-4">
                        {Object.entries(currentQuestion.options).map(([key, value]) => {
                            const isSelected = selectedAnswer === key;
                            const isCorrect = key === currentQuestion.correctAnswer;

                            let variantStyle =
                                "border-white/15 bg-black/30 hover:border-white/40 hover:bg-white/5 text-white";
                            if (isAnswered) {
                                if (isCorrect)
                                    variantStyle = "border-emerald-400 bg-emerald-500/15 text-white";
                                else if (isSelected)
                                    variantStyle = "border-red-400 bg-red-500/15 text-white";
                                else
                                    variantStyle =
                                        "border-white/10 bg-black/40 text-white/50";
                            }

                            return (
                                <button
                                    key={key}
                                    onClick={() => handleAnswer(key)}
                                    disabled={isAnswered}
                                    className={`flex items-center gap-4 w-full p-5 border-2 rounded-2xl text-left transition-all duration-200 backdrop-blur ${variantStyle}`}
                                >
                                    <span
                                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold border-2 ${
                                            isAnswered && isCorrect
                                                ? "bg-emerald-500 border-emerald-400 text-white"
                                                : isAnswered && isSelected && !isCorrect
                                                ? "bg-red-500 border-red-400 text-white"
                                                : "border-white/30 text-white/80"
                                        }`}
                                    >
                                        {key.toUpperCase()}
                                    </span>
                                    <span className="text-lg font-medium">
                                        {value}
                                    </span>
                                    {isAnswered && isCorrect && (
                                        <CheckCircle2 className="ml-auto text-emerald-400" />
                                    )}
                                    {isAnswered && isSelected && !isCorrect && (
                                        <XCircle className="ml-auto text-red-400" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
