"use client";

import { useEffect, useMemo, useState } from "react";
import { Trophy, Calendar, Clock } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { fetchUserMockResults, MockResultRow } from "@/lib/registan-utils";
import { accuracyColor } from "@/lib/status-colors";
import { averageCertificateScore, certificatePercent, formatScore, roundScore , errorIsShowable } from "@/lib/certificate-scale";
import { gradeLevelDisplay, GradeLevel } from "@/lib/mock-grade-level";
import TeacherResultsExplorer from "@/components/teacher-results-explorer";
import StudentScoreReport from "@/components/student-score-report";
import StudentMistakeReview from "@/components/student-mistake-review";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

type ResultRow = MockResultRow;

export default function ResultsPage() {
    const { user } = useAuthStore();
    const { locale } = useLocale();
    const t = useTranslations("results");
    const [results, setResults] = useState<ResultRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [openReportId, setOpenReportId] = useState<string | null>(null);

    useEffect(() => {
        if (!user || user.role === "teacher") return;
        (async () => {
            setLoading(true);
            setResults(await fetchUserMockResults(user.id));
            setLoading(false);
        })();
    }, [user]);

    // `score` is raw points earned (sum of question.points), not a percentage —
    // `accuracy` is the pre-computed correct/total percentage from submit_mock.
    // A result the teacher/admin hasn't finalized yet (revealed_at IS NULL —
    // paid mock, or a free mock taken via a class) is excluded here too, not
    // just from the per-row display below.
    const scoredResults = useMemo(() => results.filter((r) => r.revealed_at), [results]);
    // Средний — по баллу сертификата, приведённому к сотне (§8), а не по
    // проценту правильных. Работы без посчитанного балла не занижают среднее.
    const avgScore = averageCertificateScore(scoredResults.map((r) => ({ score: r.level_score, max: r.level_score_max })));

    if (user?.role === "teacher") return <TeacherResultsExplorer />;

    return (
        <div className="flex flex-col gap-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                        {t("subtitle")}
                    </p>
                </div>
                {avgScore !== null ? (
                    <div className="flex items-center gap-3 self-start rounded-2xl border border-border bg-muted/50 px-5 py-3 dark:bg-muted/30">
                        <Trophy size={18} className="text-primary" />
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("averageScore")}</p>
                            <p className="text-xl font-extrabold tabular-nums text-foreground">{formatScore(avgScore)}</p>
                        </div>
                    </div>
                ) : null}
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-20 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : results.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <Trophy size={28} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("noResultsYet")}</p>
                        <p className="mt-1 text-sm text-muted-foreground/70">{t("resultsWillAppear")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {results.map((r) => {
                            const pending = !r.revealed_at;
                            // Отчёт (§R.7) раскрывается по клику: список из
                            // десятка работ должен оставаться сканируемым, а
                            // подробности нужны по одной работе за раз.
                            const open = openReportId === r.id;
                            // Раскрывается всё, что уже опубликовано. Балл в это
                            // условие НЕ входит: ошибки от него не зависят, а
                            // level_score ставит пересчёт Раша, а не сдача — сразу
                            // после отправки он пуст, и работа была бы нераскрываемой
                            // именно тогда, когда разбор нужен больше всего. Если
                            // балла нет, блок с баллом внутри просто не рисуется.
                            const canOpen = !pending;
                            return (
                                <div key={r.id} className="rounded-2xl border border-border bg-card transition-all hover:bg-muted/40">
                                <div
                                    role={canOpen ? "button" : undefined}
                                    tabIndex={canOpen ? 0 : undefined}
                                    onClick={() => canOpen && setOpenReportId(open ? null : r.id)}
                                    onKeyDown={(event) => {
                                        if (!canOpen) return;
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            setOpenReportId(open ? null : r.id);
                                        }
                                    }}
                                    className={`flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-center ${canOpen ? "cursor-pointer" : ""}`}
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="truncate font-semibold text-foreground">{r.mock_test_title}</p>
                                            {!pending && r.grade_level && (
                                                <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
                                                    {gradeLevelDisplay(r.grade_level as GradeLevel, locale)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Calendar size={12} />
                                                {new Date(r.completed_at).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ", { day: "numeric", month: "long", year: "numeric" })}
                                            </span>
                                            {!pending && (
                                                <span className="flex items-center gap-1">
                                                    <Clock size={12} />
                                                    {r.correct_answers}/{r.total_questions} {t("correctSuffix")}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {pending ? (
                                        <span className="shrink-0 self-start rounded-xl border border-border bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground sm:self-auto">
                                            {t("resultsPendingLabel")}
                                        </span>
                                    ) : (
                                        <div className="flex shrink-0 flex-col items-end gap-0.5 self-start sm:self-auto">
                                            {/* Балл сертификата. Максимум намеренно не
                                                показывается — только сам балл (решение
                                                владельца), поэтому знаменателя тут нет,
                                                он нужен лишь для раскраски. Сырая сумма и
                                                процент убраны: см. design/FIX.md. */}
                                            {r.level_score != null ? (
                                                <>
                                                    <span className={`rounded-xl px-4 py-2 text-sm font-extrabold tabular-nums ${accuracyColor(certificatePercent(r.level_score, r.level_score_max))}`}>
                                                        {formatScore(r.level_score)}
                                                    </span>
                                                    {/* Погрешность балла (ТЗ D.7). Без неё одна
                                                        десятая обещает точность, которой нет: на
                                                        реальном моке SE вышла ±3–4 балла, и два
                                                        балла в пределах этого — один результат.
                                                        Показывается только когда посчитана: у работ
                                                        до миграции 093 её нет, и выдумывать нельзя
                                                        (§233). */}
                                                    {r.score_se != null && errorIsShowable(r.score_se, 1.96, r.level_score_max ?? undefined) && (
                                                        <span
                                                            className="text-[11px] font-semibold tabular-nums text-muted-foreground"
                                                            title={t("scoreErrorHint")}
                                                        >
                                                            ± {formatScore(roundScore(r.score_se))}
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="rounded-xl border border-border bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground">
                                                    {t("levelPendingShort")}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {open && (
                                    <div className="border-t border-border p-5 pt-4">
                                        {/* Ничего не считает заново: берёт то, что
                                            уже лежит в mock_results, и оформляет.
                                            Модель, θ, шкала и пороги не участвуют. */}
                                        <StudentScoreReport
                                            score={r.level_score}
                                            scoreMax={r.level_score_max}
                                            scoreSe={r.score_se}
                                            level={(r.grade_level as GradeLevel | null) ?? null}
                                            measurementStatus={r.measurement_status}
                                        />
                                        {/* Разбор ошибок. По каким мокам он виден,
                                            решает база (миграция 111): бесплатные и
                                            назначенные учителем — да, «Ойлик» и
                                            платные самокупленные — нет. Если строк
                                            нет, блок не рисуется. */}
                                        <StudentMistakeReview resultId={r.id} />
                                    </div>
                                )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
