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
import { CheckCircle2, XCircle, ArrowRight, RefreshCw, Home } from "lucide-react";
import { getMedalByErrors } from "@/lib/constants";

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

    if (isLoading) return <div className="flex items-center justify-center h-screen">Загрузка теста...</div>;
    if (!topic || questions.length === 0) return <div className="py-24 text-center">Вопросы не найдены</div>;

    if (isFinished) {
        const medal = getMedalByErrors(results.errors, 1);
        const medalIcons: Record<string, string> = { green: "🟢", grey: "⚪", bronze: "🥉", none: "⬜" };

        const accuracyPercent = Math.round((results.correct / questions.length) * 100);
        let resultMessage = "Попробуйте еще раз.";

        if (accuracyPercent >= 87) resultMessage = "Отлично! 🎉";
        else if (accuracyPercent >= 70) resultMessage = "Хорошо! 👍";
        else if (accuracyPercent >= 50) resultMessage = "Неплохо. Попробуй ещё раз.";

        return (
            <div className="max-w-2xl mx-auto py-16 text-center animate-in fade-in zoom-in duration-500">
                <div className="text-8xl mb-8">{medalIcons[medal]}</div>
                <h1 className="text-3xl font-bold mb-4">{resultMessage}</h1>

                <Card className="p-8 bg-neutral-50 border-neutral-200 mb-8">
                    <div className="grid grid-cols-1 gap-6">
                        <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Точность</span>
                            <span className="text-2xl font-bold text-blue-600">
                                {Math.round((results.correct / questions.length) * 100)}%
                            </span>
                        </div>
                        <div className="flex items-center justify-between border-t pt-4">
                            <span className="text-neutral-500">Правильно</span>
                            <span className="font-semibold">{results.correct} / {questions.length}</span>
                        </div>
                        <div className="flex items-center justify-between border-t pt-4">
                            <span className="text-neutral-500">Ошибки</span>
                            <span className="font-semibold">{results.errors}</span>
                        </div>
                    </div>
                </Card>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Button onClick={() => router.push(`/textbook/${topic.textbookId}`)} className="h-12 text-lg">
                        Вернуться к темам
                    </Button>
                    <Button variant="outline" onClick={() => window.location.reload()} className="h-12 text-lg">
                        <RefreshCw className="mr-2" size={20} /> Переделать тест
                    </Button>
                </div>
            </div>
        );
    }

    const currentQuestion = questions[currentIdx];
    const progress = ((currentIdx + 1) / questions.length) * 100;

    return (
        <div className="max-w-3xl mx-auto py-8">
            {/* Progress Header */}
            <div className="sticky top-0 bg-white z-10 py-4 border-b border-neutral-100 mb-12">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-neutral-500">
                        Вопрос {currentIdx + 1} из {questions.length}
                    </span>
                    <span className="text-sm font-medium text-neutral-500">
                        {Math.round(progress)}%
                    </span>
                </div>
                <Progress value={progress} className="h-1.5" />
            </div>

            {/* Question Section */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-2xl font-semibold text-neutral-900 mb-12 leading-relaxed">
                    {currentQuestion.text}
                </h2>

                <div className="grid grid-cols-1 gap-4">
                    {Object.entries(currentQuestion.options).map(([key, value]) => {
                        const isSelected = selectedAnswer === key;
                        const isCorrect = key === currentQuestion.correctAnswer;

                        let variantStyle = "border-neutral-200 hover:border-blue-500 hover:bg-blue-50";
                        if (isAnswered) {
                            if (isCorrect) variantStyle = "border-green-500 bg-green-50";
                            else if (isSelected) variantStyle = "border-red-500 bg-red-50";
                            else variantStyle = "border-neutral-100 opacity-50";
                        }

                        return (
                            <button
                                key={key}
                                onClick={() => handleAnswer(key)}
                                disabled={isAnswered}
                                className={`flex items-center gap-4 w-full p-5 border-2 rounded-xl text-left transition-all duration-200 ${variantStyle}`}
                            >
                                <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold border-2 ${isAnswered && isCorrect ? "bg-green-500 border-green-500 text-white" :
                                    isAnswered && isSelected && !isCorrect ? "bg-red-500 border-red-500 text-white" :
                                        "border-neutral-200 text-neutral-400"
                                    }`}>
                                    {key.toUpperCase()}
                                </span>
                                <span className="text-lg text-neutral-800 font-medium">{value}</span>
                                {isAnswered && isCorrect && <CheckCircle2 className="ml-auto text-green-500" />}
                                {isAnswered && isSelected && !isCorrect && <XCircle className="ml-auto text-red-500" />}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
