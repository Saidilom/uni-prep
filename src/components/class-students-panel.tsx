"use client";

import { ReactNode, useMemo, useState } from "react";
import { ChevronDown, Circle } from "lucide-react";
import { ClassStudentOverview, StudentMockScore, ClassMockAssignment } from "@/lib/class-utils";
import { accuracyColor } from "@/lib/status-colors";
import { certificatePercent } from "@/lib/certificate-scale";
import { gradeLevelDisplay, GradeLevel } from "@/lib/mock-grade-level";
import { pluralizeRu } from "@/lib/pluralize-ru";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

type Props = {
    students: ClassStudentOverview[];
    mockScores: Map<string, StudentMockScore[]>;
    assignments: ClassMockAssignment[];
    // Учительская и админская страницы группы показывают этот список
    // одинаково, но берут переводы из своих словарей.
    labels: {
        attemptWord: string;
        neverTakenTests: string;
        mockScoresAction: string;
        resultsPendingLabel: string;
        levelPendingShort: string;
        filterAllMocks: string;
        filterLabel: string;
        notTakenThisMock: string;
        mockNumberPrefix: string;
    };
    // Учительская страница держит в строке ученика свои действия (назначить
    // вступительный тест, удалить из группы) — админская нет.
    renderActions?: (studentId: string) => ReactNode;
};

// Ученики группы с их результатами.
//
// Фильтр по моку появился потому, что одноимённых тестов бывает несколько
// (в проде — четыре «Tarix fanidan namunaviy test topshiriqlari»), и средний
// балл по всем сразу не отвечает на вопрос «а что было на втором мока».
// Выбрали конкретный — у каждого ученика виден балл именно за него.
export default function ClassStudentsPanel({ students, mockScores, assignments, labels, renderActions }: Props) {
    const { locale } = useLocale();
    const tCommon = useTranslations("classDetail");
    const [selectedMock, setSelectedMock] = useState<string>("all");
    const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

    const mockLabel = (seq: number | null, title: string, createdAt: string | null) => {
        const date = createdAt
            ? new Date(createdAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ", { day: "2-digit", month: "2-digit" })
            : null;
        const number = seq !== null ? `${labels.mockNumberPrefix}${seq} · ` : "";
        return `${number}${title}${date ? ` · ${date}` : ""}`;
    };

    // Список для фильтра — объединение того, что группе НАЗНАЧЕНО, и того, что
    // ученики РЕАЛЬНО сдавали. Эти множества расходятся: на проде группе
    // назначен один мок (№4), а её ученики писали ещё №2 и №3 — они успели
    // сдать до назначения либо получили тест индивидуально. Строй список
    // только по назначениям, и результаты по этим двум мокам стали бы
    // недоступны, хотя они есть.
    const filterOptions = useMemo(() => {
        const byId = new Map<string, { mockTestId: string; seq: number | null; title: string; createdAt: string | null }>();
        for (const a of assignments) {
            byId.set(a.mockTestId, { mockTestId: a.mockTestId, seq: a.seq, title: a.title, createdAt: a.createdAt });
        }
        for (const list of Array.from(mockScores.values())) {
            for (const score of list) {
                if (byId.has(score.mockTestId)) continue;
                byId.set(score.mockTestId, { mockTestId: score.mockTestId, seq: score.seq, title: score.title, createdAt: null });
            }
        }
        // Сортировка по номеру, а не по дате назначения: номер — это то, чем
        // эти тесты называют вслух, когда они одноимённые.
        return Array.from(byId.values()).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    }, [assignments, mockScores]);

    const scoreFor = (studentId: string) =>
        (mockScores.get(studentId) || []).find((row) => row.mockTestId === selectedMock) ?? null;

    const renderScoreBadge = (score: StudentMockScore | null) => {
        if (!score) {
            return <span className="rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">{labels.notTakenThisMock}</span>;
        }
        if (!score.revealed) {
            return <span className="rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">{labels.resultsPendingLabel}</span>;
        }
        if (score.levelScore === null) {
            return <span className="rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">{labels.levelPendingShort}</span>;
        }
        return (
            <span className={`rounded-xl px-3 py-1.5 text-sm font-extrabold tabular-nums ${accuracyColor(certificatePercent(score.levelScore, score.levelScoreMax))}`}>
                {score.levelScore}
            </span>
        );
    };

    return (
        <>
            {filterOptions.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
                    <span className="text-xs font-semibold text-muted-foreground">{labels.filterLabel}</span>
                    <select
                        value={selectedMock}
                        onChange={(event) => { setSelectedMock(event.target.value); setExpandedStudent(null); }}
                        className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground sm:flex-none"
                    >
                        <option value="all">{labels.filterAllMocks}</option>
                        {filterOptions.map((assignment) => (
                            <option key={assignment.mockTestId} value={assignment.mockTestId}>
                                {mockLabel(assignment.seq, assignment.title, assignment.createdAt)}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div className="space-y-3">
                {students.map((s) => {
                    const scores = mockScores.get(s.student.id) || [];
                    const isOpen = expandedStudent === s.student.id;
                    const filtered = selectedMock !== "all";
                    return (
                        <div key={s.student.id} className="rounded-2xl border border-border bg-card">
                            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted font-bold text-foreground">
                                        {s.student.name[0]?.toUpperCase() || "?"}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">{s.student.name} {s.student.surname || ""}</p>
                                        <p className="font-mono text-xs text-muted-foreground">{s.student.shortId}</p>
                                    </div>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-3">
                                    {filtered ? (
                                        // Выбран конкретный мок — показываем балл ровно за него,
                                        // средний по всем мокам здесь только сбивал бы.
                                        renderScoreBadge(scoreFor(s.student.id))
                                    ) : (
                                        <>
                                            <span className="text-xs text-muted-foreground">
                                                {s.attemptCount > 0
                                                    ? `${s.attemptCount} ${locale === "ru" ? pluralizeRu(s.attemptCount, ["попытка", "попытки", "попыток"]) : labels.attemptWord}`
                                                    : labels.neverTakenTests}
                                            </span>
                                            {/* Средний по всем мокам — в процентах: разные тесты,
                                                разный максимум (design/FIX.md). */}
                                            <span className={`rounded-xl px-3 py-1.5 text-sm font-extrabold tabular-nums ${accuracyColor(s.avgAccuracy)}`}>
                                                {s.avgAccuracy !== null ? `${s.avgAccuracy}%` : "—"}
                                            </span>
                                            <button
                                                onClick={() => setExpandedStudent(isOpen ? null : s.student.id)}
                                                disabled={scores.length === 0}
                                                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
                                            >
                                                {labels.mockScoresAction.replace("{count}", String(scores.length))}
                                                <ChevronDown size={13} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                            </button>
                                        </>
                                    )}
                                    {renderActions?.(s.student.id)}
                                </div>
                            </div>

                            {!filtered && isOpen && scores.length > 0 && (
                                <div className="space-y-2 border-t border-border p-4">
                                    {scores.map((score) => (
                                        <div key={score.mockTestId} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-foreground">
                                                    {mockLabel(score.seq, score.title, null)}
                                                </p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {new Date(score.completedAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ", { day: "numeric", month: "long", year: "numeric" })}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                {score.gradeLevel && (
                                                    <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                                                        {gradeLevelDisplay(score.gradeLevel as GradeLevel, locale)}
                                                    </span>
                                                )}
                                                {renderScoreBadge(score)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
                {students.length === 0 && (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <Circle size={20} className="mx-auto mb-2 text-muted-foreground/40" />
                        <p className="font-medium text-muted-foreground">{tCommon("noStudentsInGroup")}</p>
                    </div>
                )}
            </div>
        </>
    );
}
