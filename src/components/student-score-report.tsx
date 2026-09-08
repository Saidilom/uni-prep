"use client";

import { Target, Info } from "lucide-react";
import {
    formatScore,
    formatScoreInterval,
    certificatePercent,
} from "@/lib/certificate-scale";
import { scoreConfidenceInterval } from "@/lib/rasch";
import {
    GradeLevel,
    gradeLevelDisplay,
    pointsToNextLevel,
    gapIsWithinError,
    levelsWithinInterval,
} from "@/lib/mock-grade-level";
import { accuracyColor } from "@/lib/status-colors";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

// Отчёт ученику по одной работе. ТЗ §R.7 и §D.7.
//
// Показывает четыре вещи: балл, его погрешность, уровень и сколько до
// следующего уровня. Ничего не считает заново — берёт то, что уже посчитано и
// лежит в mock_results, и только оформляет. Модель, θ, калибровка, шкала и
// пороги здесь не участвуют.
//
// ═══ ПОЧЕМУ ПОГРЕШНОСТЬ ПОКАЗЫВАЕТСЯ РЯДОМ, А НЕ ПРЯЧЕТСЯ ═══
//
// §D.7 требует «±SE в баллах для отчёта ученику». На реальном моке SE вышла
// ±3,2–4,6 балла, и из 630 пар работ статистически различимы только 206. Без
// интервала одна десятая в балле обещает точность, которой нет: ученик читает
// 31,4 против 32,1 как «я хуже», хотя это один и тот же результат.
//
// Отсюда же осторожность с «сколько до следующего уровня»: если разрыв меньше
// погрешности, вместо «не хватает 1,4» показывается, что уровень мог бы быть и
// следующим — §L.5 про то же самое, только со стороны порога.

export type StudentScoreReportProps = {
    score: number | null;
    scoreMax: number | null;
    scoreSe: number | null;
    level: GradeLevel | null;
    /** OK | LOW_INFORMATION | INSUFFICIENT_INFORMATION. */
    measurementStatus?: string | null;
};

export default function StudentScoreReport({
    score, scoreMax, scoreSe, level, measurementStatus,
}: StudentScoreReportProps) {
    const { locale } = useLocale();
    const t = useTranslations("studentReport");

    if (score === null || !Number.isFinite(score)) return null;

    const interval = scoreConfidenceInterval(score, scoreSe);
    const gap = pointsToNextLevel(score);
    const gapWithinError = gap ? gapIsWithinError(gap.pointsNeeded, scoreSe) : false;
    // Уровни, которые накрывает интервал: если их больше одного, ученик у
    // границы, и объявлять его уровень как точно измеренный нельзя (§L.5).
    const coveredLevels = levelsWithinInterval(interval);
    const borderline = (coveredLevels?.length ?? 0) > 1;
    // §217: измерения могло не быть вовсе — тогда балл показывать как
    // надёжный нельзя, и об этом надо сказать, а не промолчать.
    const unreliable = measurementStatus === "INSUFFICIENT_INFORMATION"
        || measurementStatus === "LOW_INFORMATION";

    return (
        <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {t("scoreLabel")}
                    </p>
                    <p className="mt-1 flex items-baseline gap-2">
                        <span className="text-4xl font-extrabold tabular-nums text-foreground">
                            {formatScore(score)}
                        </span>
                        {scoreMax !== null && (
                            <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                                / {formatScore(scoreMax)}
                            </span>
                        )}
                        {/* §D.7: ±SE рядом с баллом, а не в сноске. */}
                        {scoreSe !== null && Number.isFinite(scoreSe) && (
                            <span className="text-sm font-bold tabular-nums text-muted-foreground">
                                ± {formatScore(scoreSe)}
                            </span>
                        )}
                    </p>
                </div>
                {level && (
                    <span className={`rounded-xl px-4 py-2 text-sm font-extrabold ${accuracyColor(certificatePercent(score, scoreMax))}`}>
                        {gradeLevelDisplay(level, locale)}
                    </span>
                )}
            </div>

            {/* Что означает погрешность — словами, а не только знаком ±. */}
            {interval && (
                <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <Info size={14} className="mt-0.5 shrink-0" />
                    <span>
                        {t("intervalExplain").replace("{range}", formatScoreInterval(interval))}
                    </span>
                </p>
            )}

            {/* §L.5: у границы уровень назвать точно нельзя. */}
            {borderline && coveredLevels && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                    {t("borderlineWarning").replace(
                        "{levels}",
                        coveredLevels.map((l) => gradeLevelDisplay(l, locale)).join(" · "),
                    )}
                </p>
            )}

            {/* §217: измерение может быть недостаточным — молчать об этом нельзя. */}
            {unreliable && (
                <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs font-semibold leading-relaxed text-muted-foreground">
                    {t("lowInformationWarning")}
                </p>
            )}

            {/* §R.7: «сколько до следующего уровня». */}
            {gap ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2">
                    <Target size={14} className="mt-0.5 shrink-0 text-primary" />
                    <p className="text-xs leading-relaxed text-foreground">
                        {gapWithinError
                            // Разрыв внутри погрешности: обещать «почти дотянул»
                            // нельзя — мы не отличаем его от того, кто дотянул.
                            ? t("nextLevelWithinError")
                                .replace("{points}", formatScore(gap.pointsNeeded))
                                .replace("{level}", gradeLevelDisplay(gap.nextLevel, locale))
                            : t("nextLevelGap")
                                .replace("{points}", formatScore(gap.pointsNeeded))
                                .replace("{level}", gradeLevelDisplay(gap.nextLevel, locale))}
                    </p>
                </div>
            ) : (
                <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs font-semibold text-foreground">
                    {t("topLevelReached")}
                </p>
            )}
        </div>
    );
}
