"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Play, Loader2, ChevronDown } from "lucide-react";
import { fetchIrt3plReport, type Irt3plReport } from "@/lib/class-utils";
import { pageCache } from "@/lib/page-cache";
import { formatScore } from "@/lib/certificate-scale";
import { gradeLevelDisplay, type GradeLevel } from "@/lib/mock-grade-level";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";
import PanelSkeleton from "@/components/panel-skeleton";

// Протокол расчёта балла.
//
// ═══ ЗАЧЕМ ЭТОТ ЭКРАН СУЩЕСТВУЕТ ═══
//
// Владелец попросил прозрачные расчёты — «чтобы не было вопросов, работает
// она или нет». Ответ нельзя дать словами, поэтому здесь показаны сами числа:
// все три параметра каждого задания, θ и погрешность каждого ученика и,
// главное, СКОЛЬКО наблюдений приходится на один оцениваемый параметр.
//
// С 2026-09-13 балл считает именно 3PL — панель показывает действующую
// модель, а не вторую рядом.

// Ошибка восстановления ИЗВЕСТНЫХ параметров на синтетике, замерено тестом
// src/lib/irt-3pl.test.ts (20 заданий, c = 0.25, детерминированный ГПСЧ).
// Числа зашиты, чтобы экран не пересчитывал их при каждом открытии; повторить
// их можно прогоном того же теста.
const RECOVERY_BY_SAMPLE: Array<{ n: number; b: number; a: number }> = [
    { n: 2000, b: 0.074, a: 0.126 },
    { n: 500, b: 0.110, a: 0.223 },
    { n: 100, b: 0.178, a: 0.262 },
    { n: 36, b: 0.341, a: 0.380 },
];

export default function Irt3plPanel({ mockTestId }: { mockTestId: string }) {
    const t = useTranslations("irt3pl");
    const { locale } = useLocale();
    const [report, setReport] = useState<Irt3plReport | null>(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [openPerson, setOpenPerson] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        fetchIrt3plReport(mockTestId).then((data) => { if (active) setReport(data); });
        return () => { active = false; };
    }, [mockTestId]);

    const run = async () => {
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
            setReport(await fetchIrt3plReport(mockTestId));
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

    // Наблюдений на параметр: заданий × учеников, делённое на 3·заданий + учеников.
    const perParameter = items.length > 0 && people.length > 0
        ? (people.length * items.length) / (items.length * 3 + people.length)
        : 0;

    const undetermined = items.filter((i) => i.status === "NONE_CORRECT" || i.status === "ALL_CORRECT" || i.status === "NO_RESPONSES").length;

    return (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-bold">{t("title")}</h3>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>
                </div>
                <button
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

            {!computed ? (
                <p className="mt-5 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">{t("notComputed")}</p>
            ) : (
                <>
                    {/* ═══ Честная строка о выборке. Стоит ПЕРВОЙ намеренно ═══ */}
                    <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30">
                        <p className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-300">
                            <AlertTriangle size={15} /> {t("sampleTitle")}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-amber-900/90 dark:text-amber-300/80">
                            {t("sampleBody")
                                .replace("{items}", String(items.length))
                                .replace("{people}", String(people.length))
                                .replace("{params}", String(items.length * 3 + people.length))
                                .replace("{perParam}", perParameter.toFixed(1))}
                        </p>
                        {undetermined > 0 && (
                            <p className="mt-2 text-sm text-amber-900/90 dark:text-amber-300/80">
                                {t("undetermined").replace("{count}", String(undetermined))}
                            </p>
                        )}
                        <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="text-muted-foreground">
                                    <tr>
                                        <th className="py-1 text-left font-semibold">{t("recoveryN")}</th>
                                        <th className="py-1 text-right font-semibold">{t("recoveryB")}</th>
                                        <th className="py-1 text-right font-semibold">{t("recoveryA")}</th>
                                    </tr>
                                </thead>
                                <tbody className="tabular-nums">
                                    {RECOVERY_BY_SAMPLE.map((row) => (
                                        <tr key={row.n} className={row.n === 36 ? "font-bold" : ""}>
                                            <td className="py-0.5">{row.n}</td>
                                            <td className="py-0.5 text-right">{row.b.toFixed(3)}</td>
                                            <td className="py-0.5 text-right">{row.a.toFixed(3)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="mt-2 text-[11px] leading-relaxed text-amber-900/70 dark:text-amber-300/60">{t("recoveryNote")}</p>
                        </div>
                    </div>

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
                                            <td className="py-2 text-right text-xs">
                                                {person.level ? gradeLevelDisplay(person.level as GradeLevel, locale) : "—"}
                                            </td>
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
                                        <th className="py-1.5 text-right font-semibold">a</th>
                                        <th className="py-1.5 text-right font-semibold">b</th>
                                        <th className="py-1.5 text-right font-semibold">c</th>
                                        <th className="py-1.5 text-right font-semibold">{t("itemsPrior")}</th>
                                        <th className="py-1.5 text-right font-semibold">{t("itemsSample")}</th>
                                        <th className="py-1.5 text-left font-semibold">{t("itemsStatus")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border tabular-nums">
                                    {items.map((item) => (
                                        <tr key={item.questionId}>
                                            <td className="py-1 text-right">{item.discrimination.toFixed(3)}</td>
                                            <td className="py-1 text-right">{item.difficulty.toFixed(3)}</td>
                                            <td className="py-1 text-right">{item.guessing.toFixed(3)}</td>
                                            <td className="py-1 text-right text-muted-foreground">{item.guessingPrior.toFixed(3)}</td>
                                            <td className="py-1 text-right">{item.correctCount}/{item.sampleSize}</td>
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
