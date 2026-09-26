"use client";

import { useEffect, useState } from "react";
import { Play, Loader2, ChevronDown, ArrowRight } from "lucide-react";
import { fetchIrt3plReport, type Irt3plReport } from "@/lib/class-utils";
import { pageCache } from "@/lib/page-cache";
import { formatScore } from "@/lib/certificate-scale";
import { gradeLevelDisplay, type GradeLevel } from "@/lib/mock-grade-level";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";
import PanelSkeleton from "@/components/panel-skeleton";
import type { ModelType } from "@/lib/irt-model-selection";
import { summarizeChanges, type ChangeSummary, type ScorePair } from "@/lib/recalc-changes";

// Протокол расчёта балла.
//
// Владелец попросил прозрачные расчёты — «чтобы не было вопросов, работает
// она или нет». Поэтому здесь сами числа: параметры заданий, θ и погрешность
// каждого ученика и — сразу под кнопкой — что именно поменял пересчёт.
//
// С 2026-09-17 модель выбирается по числу сдавших (1PL/2PL/3PL,
// src/lib/irt-model-selection.ts). У 1PL a и c технические (a = 1/1.702,
// c = 0), у 2PL c закреплён нулём — такие колонки не показываются. У OPLM
// вместо a показан вес задания 1/2/3 (a = w/1.702).

const MODEL_LABEL: Record<ModelType, string> = {
    RASCH_1PL: "1PL (Rasch)",
    OPLM_1PL: "1PL (OPLM)",
    IRT_2PL: "2PL",
    IRT_3PL: "3PL",
};

type RunChanges = {
    at: string | null;
    modelBefore: ModelType | null;
    modelAfter: ModelType | null;
    summary: ChangeSummary;
};

function pairsFromSnapshots(before: Irt3plReport, after: Irt3plReport): ScorePair[] {
    const previous = new Map(before.people.map((p) => [p.resultId, p]));
    return after.people.map((person) => {
        const old = previous.get(person.resultId);
        return {
            resultId: person.resultId,
            name: person.name,
            scoreBefore: old ? old.score : null,
            scoreAfter: person.score,
            levelBefore: old ? old.level : null,
            levelAfter: person.level,
        };
    });
}

// Без ревизии у работы — балл в этом прогоне не сдвинулся (или не был показан).
function pairsFromRevisions(report: Irt3plReport): ScorePair[] {
    const revision = new Map(report.lastRunRevisions.map((r) => [r.resultId, r]));
    return report.people.map((person) => {
        const old = revision.get(person.resultId);
        return {
            resultId: person.resultId,
            name: person.name,
            scoreBefore: old ? old.score : person.score,
            scoreAfter: person.score,
            levelBefore: old ? old.level : person.level,
            levelAfter: person.level,
        };
    });
}

function changesFromRevisions(report: Irt3plReport): RunChanges | null {
    if (report.lastRunRevisions.length === 0) return null;
    return {
        at: report.modelSelectedAt,
        modelBefore: report.lastRunRevisions.find((r) => r.modelType)?.modelType ?? null,
        modelAfter: report.modelType,
        summary: summarizeChanges(pairsFromRevisions(report)),
    };
}

const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatScore(Math.abs(value))}`;

export default function Irt3plPanel({ mockTestId }: { mockTestId: string }) {
    const t = useTranslations("irt3pl");
    const { locale } = useLocale();
    const [report, setReport] = useState<Irt3plReport | null>(null);
    const [runChanges, setRunChanges] = useState<RunChanges | null>(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [openPerson, setOpenPerson] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        fetchIrt3plReport(mockTestId).then((data) => { if (active) setReport(data); });
        return () => { active = false; };
    }, [mockTestId]);

    const run = async () => {
        if (!report) return;
        const before = report;
        setRunning(true);
        setError(null);
        try {
            const response = await fetch("/api/rasch/recalculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mockTestId }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || t("runFailed"));
            // Кеш обязателен к сбросу: иначе экран покажет прежние числа, и
            // человек не увидит результата собственного действия.
            pageCache.invalidate(`irt3pl:${mockTestId}`);
            const after = await fetchIrt3plReport(mockTestId);
            setReport(after);
            // Сравнение снимков, а не ревизий: ревизии видит только админ и
            // только по показанным работам, а сдвиг нужен любому, кто нажал.
            setRunChanges({
                at: after.modelSelectedAt,
                modelBefore: before.modelType,
                modelAfter: after.modelType,
                summary: summarizeChanges(pairsFromSnapshots(before, after)),
            });
        } catch (runError) {
            setError(runError instanceof Error ? runError.message : String(runError));
        } finally {
            setRunning(false);
        }
    };

    if (!report) return <PanelSkeleton />;

    const people = report.people;
    const items = report.items;
    const computed = people.length > 0;

    // Без модели на тесте — расчёт до миграции 124, а тогда считала только 3PL.
    const modelType: ModelType = report.modelType ?? "IRT_3PL";
    const isOplm = modelType === "OPLM_1PL";
    const showA = modelType === "IRT_2PL" || modelType === "IRT_3PL";
    const label = (m: ModelType) => (m === "OPLM_1PL" ? t("modelOplm") : MODEL_LABEL[m]);
    const showC = modelType === "IRT_3PL";
    const undetermined = items.filter((i) => i.status === "NONE_CORRECT" || i.status === "ALL_CORRECT" || i.status === "NO_RESPONSES").length;

    const changes = runChanges ?? changesFromRevisions(report);
    const formatAt = (at: string | null) => at
        ? new Date(at).toLocaleString(locale === "uz" ? "uz-UZ" : "ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "";
    const levelText = (level: string | null) => (level ? gradeLevelDisplay(level as GradeLevel, locale) : "—");

    const chip = "rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold tabular-nums";

    return (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="mr-1 text-lg font-bold">{t("title")}</h3>
                    {computed && (
                        <>
                            <span className={chip}>{label(modelType)}</span>
                            {report.modelSampleSize !== null && <span className={chip}>N = {report.modelSampleSize}</span>}
                            <span className={chip}>{t("chipItems").replace("{n}", String(items.length))}</span>
                            {undetermined > 0 && (
                                <span className={`${chip} border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300`}>
                                    {t("chipUndetermined").replace("{n}", String(undetermined))}
                                </span>
                            )}
                        </>
                    )}
                </div>
                {/* data-pdf-hide: запуск пересчёта — действие, а не данные;
                    кнопке, которую нельзя нажать в файле, там не место. */}
                <button
                    data-pdf-hide
                    onClick={run}
                    disabled={running}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                    {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                    {running ? t("running") : computed ? t("rerun") : t("run")}
                </button>
            </div>

            {error && (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30">{error}</p>
            )}

            {/* ═══ Что изменил последний пересчёт ═══ */}
            {changes && (
                <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold">{t("changesTitle")}</span>
                        {changes.at && <span className="text-muted-foreground">{formatAt(changes.at)}</span>}
                        {changes.modelBefore && changes.modelAfter && changes.modelBefore !== changes.modelAfter && (
                            <span className={`${chip} inline-flex items-center gap-1 border-primary/40 text-primary`}>
                                {label(changes.modelBefore)} <ArrowRight size={12} /> {label(changes.modelAfter)}
                            </span>
                        )}
                        {changes.summary.changed.length === 0 ? (
                            <span className={chip}>{t("changesNone")}</span>
                        ) : (
                            <>
                                <span className={chip}>
                                    {t("changesScores")
                                        .replace("{n}", String(changes.summary.scoresChanged))
                                        .replace("{total}", String(changes.summary.total))}
                                </span>
                                <span className={chip}>{t("changesLevels").replace("{n}", String(changes.summary.levelsChanged))}</span>
                                {changes.summary.meanAbsShift !== null && (
                                    <span className={chip}>{t("changesMean").replace("{v}", formatScore(changes.summary.meanAbsShift))}</span>
                                )}
                                {changes.summary.maxShift !== null && (
                                    <span className={chip}>{t("changesMax").replace("{v}", signed(changes.summary.maxShift))}</span>
                                )}
                            </>
                        )}
                    </div>
                    {changes.summary.changed.length > 0 && (
                        <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">{t("changesList")}</summary>
                            <div className="mt-2 max-h-72 overflow-auto">
                                <table className="w-full text-xs">
                                    <thead className="text-muted-foreground">
                                        <tr>
                                            <th className="py-1 text-left font-semibold">{t("columnStudent")}</th>
                                            <th className="py-1 text-right font-semibold">{t("columnScore3pl")}</th>
                                            <th className="py-1 text-right font-semibold">Δ</th>
                                            <th className="py-1 text-right font-semibold">{t("columnLevels")}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border tabular-nums">
                                        {changes.summary.changed.map((row) => (
                                            <tr key={row.resultId}>
                                                <td className="py-1">{row.name}</td>
                                                <td className="py-1 text-right">{formatScore(row.scoreBefore) || "—"} → {formatScore(row.scoreAfter) || "—"}</td>
                                                <td className={`py-1 text-right font-semibold ${row.shift !== null && row.shift < 0 ? "text-red-600" : "text-emerald-600"}`}>
                                                    {row.shift === null ? "—" : signed(row.shift)}
                                                </td>
                                                <td className={`py-1 text-right ${row.levelMoved ? "font-bold" : "text-muted-foreground"}`}>
                                                    {row.levelMoved ? `${levelText(row.levelBefore)} → ${levelText(row.levelAfter)}` : levelText(row.levelAfter)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    )}
                </div>
            )}

            {!computed ? (
                <p className="mt-5 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">{t("notComputed")}</p>
            ) : (
                <>
                    {/* ═══ Ученики: θ, погрешность и балл ═══ */}
                    <div className="mt-5 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                                <tr>
                                    <th className="py-2 text-left font-semibold">{t("columnStudent")}</th>
                                    <th className="py-2 text-right font-semibold">θ</th>
                                    <th className="py-2 text-right font-semibold">SE(θ)</th>
                                    <th className="py-2 text-right font-semibold">{t("columnScore3pl")}</th>
                                    <th className="py-2 text-right font-semibold">{t("columnLevels")}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {people
                                    .slice()
                                    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                                    .map((person) => (
                                        <tr key={person.resultId}>
                                            <td className="py-2">
                                                <button
                                                    onClick={() => setOpenPerson(openPerson === person.resultId ? null : person.resultId)}
                                                    className="inline-flex items-center gap-1.5 text-left font-medium hover:text-primary"
                                                >
                                                    <ChevronDown size={13} className={openPerson === person.resultId ? "rotate-180 transition-transform" : "transition-transform"} />
                                                    {person.name}
                                                </button>
                                                {openPerson === person.resultId && (
                                                    <div className="mt-2 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed">
                                                        <p>θ = {person.theta.toFixed(6)}</p>
                                                        <p>SE(θ) = {person.thetaSe === null ? "—" : person.thetaSe.toFixed(6)}</p>
                                                        <p>{t("traceStatus")}: {person.status ?? "—"}</p>
                                                        <p className="mt-1 text-muted-foreground">{t("traceFormula")}</p>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-2 text-right tabular-nums">{Number.isFinite(person.theta) ? person.theta.toFixed(3) : "—"}</td>
                                            <td className="py-2 text-right tabular-nums">{person.thetaSe === null ? "—" : person.thetaSe.toFixed(3)}</td>
                                            <td className="py-2 text-right tabular-nums">{formatScore(person.score)}</td>
                                            <td className="py-2 text-right text-xs">{levelText(person.level)}</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>

                    {/* ═══ Параметры заданий ═══ */}
                    <details className="mt-5 rounded-xl border border-border">
                        <summary className="cursor-pointer p-3 text-sm font-semibold">{t("itemsTitle")}</summary>
                        <div className="overflow-x-auto px-3 pb-3">
                            <table className="w-full text-xs">
                                <thead className="border-b border-border uppercase tracking-wider text-muted-foreground">
                                    <tr>
                                        {isOplm && <th className="py-1.5 text-right font-semibold">{t("itemsWeight")}</th>}
                                        {showA && <th className="py-1.5 text-right font-semibold">a</th>}
                                        <th className="py-1.5 text-right font-semibold">b</th>
                                        {showC && <th className="py-1.5 text-right font-semibold">c</th>}
                                        {showC && <th className="py-1.5 text-right font-semibold">{t("itemsPrior")}</th>}
                                        <th className="py-1.5 text-right font-semibold">{t("itemsSample")}</th>
                                        <th className="py-1.5 text-left font-semibold">{t("itemsStatus")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border tabular-nums">
                                    {items.map((item) => (
                                        <tr key={item.questionId}>
                                            {isOplm && <td className="py-1 text-right font-semibold">{item.weight ?? "—"}</td>}
                                            {showA && <td className="py-1 text-right">{item.discrimination.toFixed(3)}</td>}
                                            <td className="py-1 text-right">{item.difficulty.toFixed(3)}</td>
                                            {showC && <td className="py-1 text-right">{item.guessing.toFixed(3)}</td>}
                                            {showC && <td className="py-1 text-right text-muted-foreground">{item.guessingPrior.toFixed(3)}</td>}
                                            <td className="py-1 text-right">{item.sampleSize}</td>
                                            <td className="py-1 text-left">
                                                <span className={item.status === "OK" ? "text-muted-foreground" : "font-semibold text-amber-700 dark:text-amber-400"}>
                                                    {item.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </details>
                </>
            )}
        </section>
    );
}
