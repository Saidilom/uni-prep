"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trophy, TrendingUp, TrendingDown, CheckCircle2, ChevronDown, Circle, ListOrdered, Clock } from "lucide-react";
import { useToast } from "@/hooks/useToast";
import {
    fetchClassMockResults,
    fetchMockAnswerDetails,
    fetchMockQuestionErrorStats,
    invalidateMockResultCaches,
    ClassMockResultsSummary,
    MockAnswerDetail,
    QuestionErrorStat,
} from "@/lib/class-utils";
import { gradeLevelDisplay, GradeLevel } from "@/lib/mock-grade-level";
import { certificatePercent, formatScore } from "@/lib/certificate-scale";
import EssayCriteriaForm, { EssayCriteriaPayload } from "@/components/essay-criteria-form";
import MockReliabilityPanel from "@/components/mock-reliability-panel";
import DistractorReport from "@/components/distractor-report";
import PsychometricCharts from "@/components/psychometric-charts";
import { ESSAY_MAX_POINTS } from "@/lib/essay-rubric";
import { mistakeReviewAccess } from "@/lib/mistake-review-access";
import { accuracyColor } from "@/lib/status-colors";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

// classId = null — режим «весь тест»: участники берутся из самих результатов,
// а не из состава класса. Так экран проверки работает и для админского мока,
// который проходят ученики вне классов.
export default function ClassMockResultsView({ classId, mockTestId, backHref, readOnly = false }: {
    classId?: string | null;
    mockTestId: string;
    backHref: string;
    /**
     * Экран без проверки работ: только просмотр результатов.
     *
     * Нужен админу филиала. Проверять эссе он не может и не должен —
     * can_review_mock_response (миграция 099) пускает админа, назначенного
     * проверяющего и автора теста, а филиал в этот список не входит. Показывать
     * ему форму оценивания значило бы предлагать действие, которое всё равно
     * отклонит сервер.
     */
    readOnly?: boolean;
}) {
    const router = useRouter();
    const { locale } = useLocale();
    const t = useTranslations("classMockResults");
    const toast = useToast();

    const [summary, setSummary] = useState<ClassMockResultsSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [openResultId, setOpenResultId] = useState<string | null>(null);
    const [details, setDetails] = useState<Record<string, MockAnswerDetail[]>>({});
    const [detailsLoading, setDetailsLoading] = useState<Set<string>>(new Set());
    const [reviewPoints, setReviewPoints] = useState<Record<string, number>>({});
    const [reviewFeedback, setReviewFeedback] = useState<Record<string, string>>({});
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [questionStats, setQuestionStats] = useState<QuestionErrorStat[]>([]);
    const [statsLoading, setStatsLoading] = useState(true);
    // Экран служит двум разным задачам: проверить работы и посмотреть аналитику.
    // Эти три состояния разводят их, чтобы проверяющему не приходилось
    // пролистывать полсотни строк рейтинга до первого ученика, а внутри
    // ученика — искать одно эссе среди полусотни решённых задач.
    //
    // null означает «владелец ещё не трогал переключатель» — тогда состояние
    // выбирается само, по наличию непроверенных работ. Как только тронул,
    // хранится его выбор.
    const [rankingOpen, setRankingOpen] = useState<boolean | null>(null);
    const [onlyPendingStudents, setOnlyPendingStudents] = useState(false);
    const [onlyPendingAnswers, setOnlyPendingAnswers] = useState(true);

    // Guards against a slower response for a previous classId/mockTestId
    // pair overwriting a faster one's already-rendered state (this effect
    // re-fires without unmounting when navigating between two different
    // mock-results views for the same class in quick succession).
    const latestRequestKey = useRef<string | null>(null);

    useEffect(() => {
        const requestKey = `${classId}:${mockTestId}`;
        latestRequestKey.current = requestKey;
        (async () => {
            setLoading(true);
            const data = await fetchClassMockResults(classId ?? null, mockTestId);
            if (latestRequestKey.current !== requestKey) return;
            setSummary(data);
            setLoading(false);
        })();
        (async () => {
            setStatsLoading(true);
            const data = await fetchMockQuestionErrorStats(classId ?? null, mockTestId);
            if (latestRequestKey.current !== requestKey) return;
            setQuestionStats(data);
            setStatsLoading(false);
        })();
    }, [classId, mockTestId]);

    const toggleDetail = async (resultId: string) => {
        if (openResultId === resultId) {
            setOpenResultId(null);
            return;
        }
        setOpenResultId(resultId);
        if (!details[resultId]) {
            // A Set keyed by resultId (not a single string) so opening a
            // second student's panel while the first is still loading
            // doesn't clear the flag globally when the first resolves.
            setDetailsLoading((prev) => new Set(prev).add(resultId));
            const d = await fetchMockAnswerDetails(resultId);
            setDetails((prev) => ({ ...prev, [resultId]: d }));
            setDetailsLoading((prev) => {
                const next = new Set(prev);
                next.delete(resultId);
                return next;
            });
        }
    };

    const reviewResponse = async (resultId: string, detail: MockAnswerDetail) => {
        // База откажет сама (review_mock_response, «Points out of range»), но
        // это английская строка из Postgres, и по ней не понять, какой балл
        // вообще допустим. Проверяем здесь, чтобы сразу назвать максимум.
        const points = reviewPoints[detail.id] ?? detail.pointsEarned;
        if (points < 0 || points > detail.maxPoints) {
            toast.error(t("pointsOutOfRange").replace("{max}", String(detail.maxPoints)));
            return;
        }
        setReviewingId(detail.id);
        try {
            const response = await fetch(`/api/mock-responses/${detail.id}/review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // Must match the same fallback the inputs actually display
                // (lines below: `?? d.pointsEarned` / `?? d.reviewFeedback`) —
                // falling back to 0/"" here instead silently zeroed a real
                // AI-assigned grade whenever the teacher only touched one of
                // the two fields (e.g. agreed with the score, just added a
                // comment) and left the other input showing its existing
                // value without ever firing its own onChange.
                body: JSON.stringify({ points, feedback: reviewFeedback[detail.id] ?? detail.reviewFeedback ?? "" }),
            });
            const body = await response.json();
            if (!response.ok) {
                const message = /out of range/i.test(String(body.error))
                    ? t("pointsOutOfRange").replace("{max}", String(detail.maxPoints))
                    : body.error || t("reviewError");
                throw new Error(message);
            }
            // Сброс ДО перечитывания: иначе вернулись бы те же кешированные
            // числа, и проверяющий не увидел бы результата своего действия.
            invalidateMockResultCaches(mockTestId, resultId);
            const refreshed = await fetchMockAnswerDetails(resultId);
            setDetails((current) => ({ ...current, [resultId]: refreshed }));
            setSummary(await fetchClassMockResults(classId ?? null, mockTestId));
            toast.success(t("gradeSavedToast"));
        } catch (error) {
            toast.error(t("gradeSaveFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setReviewingId(null);
        }
    };

    // Оценка сочинения ПО КРИТЕРИЯМ. Балл не отправляется: его считает база из
    // самих критериев (review_mock_essay_criteria), иначе сумма могла бы
    // разойтись с тем, из чего сложена.
    const reviewEssayByCriteria = async (
        resultId: string,
        detail: MockAnswerDetail,
        payload: EssayCriteriaPayload,
    ) => {
        setReviewingId(detail.id);
        try {
            const response = await fetch(`/api/mock-responses/${detail.id}/review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || t("reviewError"));
            // Сброс ДО перечитывания: иначе вернулись бы те же кешированные
            // числа, и проверяющий не увидел бы результата своего действия.
            invalidateMockResultCaches(mockTestId, resultId);
            const refreshed = await fetchMockAnswerDetails(resultId);
            setDetails((current) => ({ ...current, [resultId]: refreshed }));
            setSummary(await fetchClassMockResults(classId ?? null, mockTestId));
            toast.success(t("gradeSavedToast"));
        } catch (error) {
            toast.error(t("gradeSaveFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setReviewingId(null);
        }
    };

    // Форма по критериям — только для сочинения родного языка на 24 балла.
    //
    // Английские Task 1 и Task 2 идут по своим официальным таблицам перевода
    // (0.6, 1.3 … 10.0), критериев в нашем смысле там нет.
    //
    // Русский исключён НАМЕРЕННО, хотя у него тоже 24: его документ
    // (tests-pdf/русский/rustili_check.pdf) с этим списком не сверялся, а
    // применить к русскому эссе узбекские двенадцать критериев значило бы
    // оценивать не по тому инструменту.
    const usesCriteriaForm = (detail: MockAnswerDetail) =>
        detail.maxPoints === ESSAY_MAX_POINTS && summary?.subjectId === "uzbek";

    if (loading || !summary) {
        return (
            <div className="flex flex-col gap-6">
                <div className="h-9 w-64 animate-pulse rounded-2xl bg-muted" />
                <div className="h-40 animate-pulse rounded-2xl border border-border bg-muted" />
            </div>
        );
    }

    const completionRate = summary.totalCount > 0 ? Math.round((summary.completedCount / summary.totalCount) * 100) : 0;

    // Есть непроверенные работы — значит пришли проверять: рейтинг вопросов
    // сворачиваем, чтобы список учеников был виден сразу. Всё проверено —
    // экран читают как аналитику, и рейтинг раскрыт.
    const hasPendingWork = !readOnly && summary.pendingReviewCount > 0;
    // По-вопросный разбор — только по разрешённым мокам (решение владельца):
    // бесплатные и назначенные учителем да, «Ойлик» и платный самокупленный
    // нет. Правило одно на весь проект — mistake-review-access.ts.
    //
    // Проверка эссе при этом остаётся доступной ВСЕГДА: у месячных тестов
    // сочинения тоже кто-то должен оценить, и запрет на разбор ошибок этому
    // мешать не должен.
    const reviewAccess = mistakeReviewAccess({
        type: summary.mockKind,
        isOylik: summary.isOylik,
        // Экран открыт из группы — значит мок ей и назначен. У админского мока
        // без класса (classId = null) назначения нет, и решает тип.
        assignedByTeacher: Boolean(classId),
    });
    const showMistakes = reviewAccess.allowed;
    const showRanking = rankingOpen ?? !hasPendingWork;
    const visibleStudents = onlyPendingStudents
        ? summary.students.filter((s) => s.pendingReviewCount > 0)
        : summary.students;

    return (
        <div className="flex flex-col gap-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section>
                <button onClick={() => router.push(backHref)} className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
                    <ArrowLeft size={14} /> {t("backToClass")}
                </button>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{summary.mockTitle}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{t("resultsSubtitle")}</p>
            </section>

            {!readOnly && summary.pendingReviewCount > 0 && (
                <div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-4 dark:border-violet-900/50 dark:bg-violet-950/25">
                    <Clock size={18} className="shrink-0 text-violet-700 dark:text-violet-300" />
                    <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">
                        {t("pendingReviewBanner").replace("{count}", String(summary.pendingReviewCount))}
                    </p>
                </div>
            )}

            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 size={15} /><span className="text-[10px] font-bold uppercase tracking-widest">{t("passedLabel")}</span></div>
                    <p className="mt-2 text-2xl font-extrabold tabular-nums text-foreground">{summary.completedCount}/{summary.totalCount}</p>
                    <p className="text-xs text-muted-foreground">{t("ofGroupSuffix").replace("{rate}", String(completionRate))}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2 text-muted-foreground"><Trophy size={15} /><span className="text-[10px] font-bold uppercase tracking-widest">{t("averageLabel")}</span></div>
                    <p className="mt-2 text-2xl font-extrabold tabular-nums text-foreground">
                        {summary.avgScore !== null ? formatScore(summary.avgScore) : "—"}
                    </p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2 text-muted-foreground"><TrendingUp size={15} /><span className="text-[10px] font-bold uppercase tracking-widest">{t("maxLabel")}</span></div>
                    <p className="mt-2 text-2xl font-extrabold tabular-nums text-foreground">
                        {summary.topScore !== null ? formatScore(summary.topScore) : "—"}
                    </p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2 text-muted-foreground"><TrendingDown size={15} /><span className="text-[10px] font-bold uppercase tracking-widest">{t("minLabel")}</span></div>
                    <p className="mt-2 text-2xl font-extrabold tabular-nums text-foreground">
                        {summary.lowScore !== null ? formatScore(summary.lowScore) : "—"}
                    </p>
                </div>
            </section>

            {/* §N.5. Свёрнуто и после плиток со средним: это характеристика
                теста, а не ученика, и она объясняет, насколько вообще можно
                опираться на разницу баллов в рейтинге ниже. */}
            <MockReliabilityPanel reliability={summary.reliability} />

            {/* §R.7. Тоже свёрнуто: разбор нужен методисту при проверке
                качества варианта, а не при проверке работ. Ученику не виден —
                таблица раскрывает ключ, доступ закрыт в RLS (миграция 103). */}
            <DistractorReport mockTestId={mockTestId} />

            {/* §D.3, D.10–D.12. Тоже свёрнуто: графики отвечают на вопрос
                «подходит ли этот вариант этой группе», а не на «кто как сдал». */}
            <PsychometricCharts mockTestId={mockTestId} />

            <section>
                {/* Раздел аналитический: для проверки работ он не нужен, а перед
                    списком учеников лежат все 50 строк теста. Поэтому заголовок —
                    кнопка, тем же жестом, что раскрывает карточку ученика. */}
                <button
                    onClick={() => setRankingOpen(!showRanking)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl text-left"
                >
                    <span className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                        <ListOrdered size={19} className="text-muted-foreground" /> {t("questionRankingTitle")}
                        {questionStats.length > 0 && (
                            <span className="rounded-lg border border-border bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                                {questionStats.length}
                            </span>
                        )}
                    </span>
                    <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform ${showRanking ? "rotate-180" : ""}`} />
                </button>
                {!showRanking ? null : (
                <>
                <p className="mb-5 mt-3 text-sm text-muted-foreground">{t("questionRankingSubtitle")}</p>
                {statsLoading ? (
                    <div className="space-y-2">
                        {[1, 2, 3].map((n) => <div key={n} className="h-14 animate-pulse rounded-2xl border border-border bg-muted" />)}
                    </div>
                ) : questionStats.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-8 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">{t("noQuestionData")}</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {questionStats.map((q, i) => (
                            <div key={q.questionId} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-xs font-bold text-muted-foreground">{i + 1}</span>
                                    <p className="truncate text-sm font-medium text-foreground">{q.questionText}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                    <span className="text-xs text-muted-foreground">{t("wrongOfTotalTemplate").replace("{wrong}", String(q.wrongCount)).replace("{total}", String(q.totalCount))}</span>
                                    <span className={`rounded-xl px-3 py-1.5 text-sm font-extrabold tabular-nums ${q.wrongRate >= 50 ? "bg-red-50 text-red-700 dark:bg-red-950/40" : q.wrongRate >= 25 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"}`}>
                                        {q.wrongRate}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                </>
                )}
            </section>

            <section>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t("studentsSection")}</h2>
                    {/* Чип нужен, только пока есть что проверять: по мере работы
                        список тает, и не приходится вспоминать, на ком
                        остановился. На готовом моке он лишний. */}
                    {hasPendingWork && (
                        <button
                            onClick={() => setOnlyPendingStudents(!onlyPendingStudents)}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                                onlyPendingStudents
                                    ? "border-transparent bg-violet-600 text-white"
                                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Clock size={13} /> {t("onlyPendingStudents")}
                        </button>
                    )}
                </div>
                <div className="space-y-3">
                    {visibleStudents.map(({ student, resultId, correctAnswers, totalQuestions, cefrBand, levelScore, levelScoreMax, gradeLevel, completedAt, pendingReviewCount }) => {
                        const isOpen = openResultId === resultId;
                        return (
                            <div key={student.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                                <button
                                    onClick={() => resultId && toggleDetail(resultId)}
                                    disabled={!resultId}
                                    className="flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-muted/40 disabled:cursor-default sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted font-bold text-foreground">
                                            {student.name[0]?.toUpperCase() || "?"}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-foreground">{student.name} {student.surname || ""}</p>
                                            {completedAt ? (
                                                <p className="text-xs text-muted-foreground">{t("correctOfTemplate").replace("{correct}", String(correctAnswers)).replace("{total}", String(totalQuestions)).replace("{date}", new Date(completedAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ"))}</p>
                                            ) : (
                                                <p className="text-xs text-muted-foreground">{t("notTakenYet")}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:shrink-0">
                                        {pendingReviewCount > 0 && (
                                            <span className="inline-flex items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-bold text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300">
                                                <Clock size={12} /> {t("pendingReviewBadge").replace("{count}", String(pendingReviewCount))}
                                            </span>
                                        )}
                                        {cefrBand && (
                                            <span className="rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300" title={t("cefrScaleTitle")}>
                                                {cefrBand}
                                            </span>
                                        )}
                                        {gradeLevel && (
                                            <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300" title={t("gradeLevelTitle")}>
                                                {gradeLevelDisplay(gradeLevel as GradeLevel, locale)}
                                            </span>
                                        )}
                                        {/* Балл ученика за этот мок — по модели Раша, 0-75.
                                            Сырая сумма и процент убраны: см. «Две шкалы 75»
                                            в design/FIX.md. Логит (θ) тоже убран — он стоял
                                            рядом с баллом вторым, непонятным числом, а на
                                            моках без посчитанного балла оставался вообще
                                            единственным. Ученику логит не показывался никогда. */}
                                        {levelScore !== null ? (
                                            <span className={`rounded-xl px-3 py-1.5 text-sm font-extrabold tabular-nums ${accuracyColor(certificatePercent(levelScore, levelScoreMax))}`}>
                                                {formatScore(levelScore)}
                                            </span>
                                        ) : resultId !== null ? (
                                            <span className="rounded-xl border border-border bg-muted px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">
                                                {t("levelPendingShort")}
                                            </span>
                                        ) : (
                                            <Circle size={16} className="text-muted-foreground/40" />
                                        )}
                                        {resultId && (
                                            <ChevronDown size={16} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                        )}
                                    </div>
                                </button>

                                {isOpen && resultId && (
                                    <div className="border-t border-border bg-muted/30 p-4">
                                        {detailsLoading.has(resultId) ? (
                                            <div className="space-y-2">
                                                {[1, 2, 3].map((n) => <div key={n} className="h-12 animate-pulse rounded-xl bg-muted" />)}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {(() => {
                                                    // Нумерация берётся из ИСХОДНОГО порядка и едет вместе с
                                                    // ответом: иначе «задание 7» на экране перестало бы быть
                                                    // седьмым в тесте, и сверить с бумагой стало бы нечем.
                                                    const all = (details[resultId] || []).map((d, i) => ({ d, number: i + 1 }));
                                                    const needsReview = (st: string) => st === "pending" || st === "ai_graded";
                                                    const pendingHere = all.filter((x) => needsReview(x.d.reviewStatus));
                                                    // Непроверенное — наверх. Проверяющий раскрыл ученика ради
                                                    // одного эссе среди полусотни решённых задач; искать его
                                                    // прокруткой пятьдесят раз подряд — то, на что и жаловались.
                                                    // По запрещённому моку («Ойлик», платный
                                                    // самокупленный) разбор не показывается — остаётся
                                                    // только то, что надо проверить руками. Проверку
                                                    // эссе запрет не отменяет: оценить сочинение в
                                                    // месячном тесте всё равно кто-то должен.
                                                    const ordered = !showMistakes
                                                        ? pendingHere
                                                        : onlyPendingAnswers && pendingHere.length > 0
                                                            ? pendingHere
                                                            : [...pendingHere, ...all.filter((x) => !needsReview(x.d.reviewStatus))];
                                                    return (<>
                                                    {!showMistakes && (
                                                        <p className="mb-2 rounded-lg bg-muted px-3 py-2 text-xs font-semibold leading-relaxed text-muted-foreground">
                                                            {/* Блок рисуется только при запрете, поэтому ветки
                                                                «разрешено» здесь нет. */}
                                                            {t(!reviewAccess.allowed && reviewAccess.reason === "OYLIK"
                                                                ? "mistakesHiddenOylik"
                                                                : "mistakesHiddenOther")}
                                                        </p>
                                                    )}
                                                    {pendingHere.length > 0 && (
                                                        <button
                                                            onClick={() => setOnlyPendingAnswers(!onlyPendingAnswers)}
                                                            className="mb-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                                                        >
                                                            {onlyPendingAnswers
                                                                ? t("showAllAnswers").replace("{count}", String(all.length))
                                                                : t("onlyPendingAnswers").replace("{count}", String(pendingHere.length))}
                                                        </button>
                                                    )}
                                                    {ordered.map(({ d, number }) => (
                                                    <div key={d.id} className="rounded-xl border border-border bg-card p-3">
                                                        <p className="text-sm font-medium text-foreground">{number}. {d.questionText}</p>
                                                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                                            <span className={d.isCorrect ? "text-emerald-600" : "text-red-600"}>
                                                                {t("studentAnswerLabel")} <strong>{d.selectedAnswer || "—"}</strong>
                                                            </span>
                                                            {/* У эссе правильного ответа не существует — его оценивают
                                                                по критерию, и correctAnswer приходит пустым. Без этой
                                                                проверки подпись «Правильный:» висела бы ни над чем. */}
                                                            {!d.isCorrect && d.correctAnswer !== "" && (
                                                                <span className="text-muted-foreground">
                                                                    {t("correctAnswerLabel")} <strong className="text-foreground">{d.correctAnswer}</strong>
                                                                </span>
                                                            )}
                                                        </div>
                                                        {!readOnly && d.reviewStatus === "pending" && usesCriteriaForm(d) && (
                                                            <EssayCriteriaForm
                                                                maxPoints={d.maxPoints}
                                                                saving={reviewingId === d.id}
                                                                saveLabel={t("save")}
                                                                onSubmit={(payload) => reviewEssayByCriteria(resultId, d, payload)}
                                                            />
                                                        )}
                                                        {!readOnly && d.reviewStatus === "pending" && !usesCriteriaForm(d) && (
                                                            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:bg-violet-950/25">
                                                                {/* Одно поле «сколько баллов» — путь для заданий БЕЗ
                                                                    критериальной таблицы: английские Task 1 и Task 2
                                                                    оцениваются по официальным таблицам перевода. У
                                                                    сочинения родного языка форма другая, по 12
                                                                    критериям (EssayCriteriaForm выше). */}
                                                                <p className="text-xs font-bold text-violet-800">{t("manualReviewNeeded")}</p>
                                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                                    <input type="number" min={0} max={d.maxPoints} step={0.1} value={reviewPoints[d.id] ?? 0} onChange={(event) => setReviewPoints((current) => ({ ...current, [d.id]: Number(event.target.value) }))} className="w-20 rounded-lg border border-violet-200 bg-background px-3 py-2 text-sm" />
                                                                    <span className="text-xs text-muted-foreground">{t("ofPointsSuffix").replace("{max}", String(d.maxPoints))}</span>
                                                                    <input value={reviewFeedback[d.id] ?? ""} onChange={(event) => setReviewFeedback((current) => ({ ...current, [d.id]: event.target.value }))} placeholder={t("commentPlaceholder")} className="w-full flex-1 sm:w-auto sm:min-w-[220px] rounded-lg border border-violet-200 bg-background px-3 py-2 text-sm" />
                                                                    <button onClick={() => reviewResponse(resultId, d)} disabled={reviewingId === d.id} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{reviewingId === d.id ? t("saving") : t("save")}</button>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {d.reviewStatus === "ai_graded" && usesCriteriaForm(d) && (
                                                            <>
                                                                <p className="mt-3 text-xs font-bold text-blue-800">{t("aiGradedLabel").replace("{earned}", String(d.pointsEarned)).replace("{max}", String(d.maxPoints))}</p>
                                                                <EssayCriteriaForm
                                                                    maxPoints={d.maxPoints}
                                                                    initialFeedback={d.reviewFeedback}
                                                                    saving={reviewingId === d.id}
                                                                    saveLabel={t("fixGrade")}
                                                                    onSubmit={(payload) => reviewEssayByCriteria(resultId, d, payload)}
                                                                />
                                                            </>
                                                        )}
                                                        {d.reviewStatus === "ai_graded" && !usesCriteriaForm(d) && (
                                                            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:bg-blue-950/25">
                                                                <p className="text-xs font-bold text-blue-800">{t("aiGradedLabel").replace("{earned}", String(d.pointsEarned)).replace("{max}", String(d.maxPoints))}</p>
                                                                {d.reviewFeedback && (
                                                                    <p className="mt-1.5 text-xs leading-relaxed text-blue-900/80 dark:text-blue-200/80">{d.reviewFeedback}</p>
                                                                )}
                                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                                    <input type="number" min={0} max={d.maxPoints} step={0.1} value={reviewPoints[d.id] ?? d.pointsEarned} onChange={(event) => setReviewPoints((current) => ({ ...current, [d.id]: Number(event.target.value) }))} className="w-20 rounded-lg border border-blue-200 bg-background px-3 py-2 text-sm" />
                                                                    <span className="text-xs text-muted-foreground">{t("ofPointsSuffix").replace("{max}", String(d.maxPoints))}</span>
                                                                    <input value={reviewFeedback[d.id] ?? d.reviewFeedback ?? ""} onChange={(event) => setReviewFeedback((current) => ({ ...current, [d.id]: event.target.value }))} placeholder={t("commentPlaceholder")} className="w-full flex-1 sm:w-auto sm:min-w-[220px] rounded-lg border border-blue-200 bg-background px-3 py-2 text-sm" />
                                                                    <button onClick={() => reviewResponse(resultId, d)} disabled={reviewingId === d.id} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{reviewingId === d.id ? t("saving") : t("fixGrade")}</button>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {d.reviewStatus === "reviewed" && <p className="mt-2 text-xs font-semibold text-violet-700">{t("manuallyReviewedLabel").replace("{earned}", String(d.pointsEarned)).replace("{max}", String(d.maxPoints))}{d.reviewFeedback ? ` · ${d.reviewFeedback}` : ""}</p>}
                                                    </div>
                                                    ))}
                                                    </>);
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
