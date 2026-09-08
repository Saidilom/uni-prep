"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n/locale-provider";
import {
    ESSAY_CRITERIA,
    ESSAY_MAX_POINTS,
    CRITERION_LEVELS,
    RUBRIC_GROUP_ORDER,
    RUBRIC_GROUP_LABEL_KEY,
    RubricGroup,
    CriterionScore,
    sumCriterionScores,
} from "@/lib/essay-rubric";

// Форма проверки сочинения ПО КРИТЕРИЯМ.
//
// Раньше здесь было одно поле «сколько баллов», и двенадцать критериев
// официального документа сворачивались в него ещё до записи — в базе не
// оставалось ни того, за что снижено, ни насколько.
//
// Теперь проверяющий видит все 12 критериев и их разделы, ставит каждому
// оценку по шкале документа (2 / 1,5 / 1 / 0,5 / 0) и видит сумму. Сумму
// форма НЕ отправляет: её считает база из самих критериев, иначе итог мог бы
// разойтись с тем, из чего он сложен.
//
// Источник критериев и шкалы — tests-pdf/узб/ona_tili_yozma_2025_yangi.pdf,
// разбор в src/lib/essay-rubric.ts.

export type EssayVerdictKind = "SCORED" | "OFF_TOPIC" | "TOO_SHORT" | "PLAGIARISM" | "NOT_WRITTEN";

export type EssayCriteriaPayload = {
    verdict: EssayVerdictKind;
    criteria: CriterionScore[];
    feedback: string;
};

type Props = {
    /** Максимум задания. Форма показывается только когда он равен 24. */
    maxPoints: number;
    initialFeedback?: string | null;
    saving: boolean;
    saveLabel: string;
    onSubmit: (payload: EssayCriteriaPayload) => void;
};

// Отказные вердикты документа. Балл у них фиксированный, критерии не
// заполняются: «Esse quyidagi hollarda tekshirilmaydi va 2 ball bilan
// baholanadi» — не на тему, короче 100 слов, списано; ненаписанная — 0.
const VERDICTS = [
    { kind: "SCORED", labelKey: "essayVerdictScored", points: null },
    { kind: "OFF_TOPIC", labelKey: "essayVerdictOffTopic", points: 2 },
    { kind: "TOO_SHORT", labelKey: "essayVerdictTooShort", points: 2 },
    { kind: "PLAGIARISM", labelKey: "essayVerdictPlagiarism", points: 2 },
    { kind: "NOT_WRITTEN", labelKey: "essayVerdictNotWritten", points: 0 },
] as const satisfies ReadonlyArray<{ kind: EssayVerdictKind; labelKey: string; points: number | null }>;

export default function EssayCriteriaForm({
    maxPoints, initialFeedback, saving, saveLabel, onSubmit,
}: Props) {
    // Переводы берём сами, а не принимаем функцию пропом: тип t привязан к
    // ключам своего словаря, и передача его наружу этот контроль снимала бы —
    // опечатка в ключе критерия перестала бы быть ошибкой сборки.
    const t = useTranslations("classMockResults");
    const [verdict, setVerdict] = useState<EssayVerdictKind>("SCORED");
    const [scores, setScores] = useState<Record<number, number>>({});
    const [feedback, setFeedback] = useState(initialFeedback ?? "");

    const chosen: CriterionScore[] = useMemo(
        () => ESSAY_CRITERIA
            .filter((c) => scores[c.index] !== undefined)
            .map((c) => ({ index: c.index, score: scores[c.index] })),
        [scores],
    );
    const total = sumCriterionScores(chosen);
    const complete = chosen.length === ESSAY_CRITERIA.length;
    const verdictPoints = VERDICTS.find((v) => v.kind === verdict)?.points ?? null;
    // Кнопка недоступна, пока оценены не все критерии: неполный набор — это не
    // «часть работы проверена», а оценка, которой не существует.
    const canSave = verdict !== "SCORED" || complete;

    const byGroup = (group: RubricGroup) => ESSAY_CRITERIA.filter((c) => c.group === group);

    return (
        <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:bg-violet-950/25">
            <p className="text-xs font-bold text-violet-800 dark:text-violet-300">{t("essayRubricTitle")}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-violet-900/70 dark:text-violet-200/70">
                {t("essayRubricSubtitle")}
            </p>

            {/* Вердикт: проверять по критериям или отказной случай документа. */}
            <div className="mt-3 flex flex-wrap gap-1.5">
                {VERDICTS.map((v) => (
                    <button
                        key={v.kind}
                        type="button"
                        onClick={() => setVerdict(v.kind)}
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                            verdict === v.kind
                                ? "bg-violet-600 text-white"
                                : "border border-violet-200 bg-background text-violet-800 hover:bg-violet-100 dark:text-violet-300"
                        }`}
                    >
                        {t(v.labelKey)}
                    </button>
                ))}
            </div>

            {verdict === "SCORED" ? (
                <div className="mt-3 flex flex-col gap-3">
                    {RUBRIC_GROUP_ORDER.map((group) => (
                        <div key={group}>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-400">
                                {t(RUBRIC_GROUP_LABEL_KEY[group])}
                            </p>
                            <div className="mt-1.5 flex flex-col gap-1.5">
                                {byGroup(group).map((criterion) => (
                                    <div
                                        key={criterion.index}
                                        className="flex flex-col gap-1.5 rounded-lg bg-background/70 p-2 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <span className="text-xs leading-snug text-foreground">
                                            <span className="mr-1.5 font-bold text-muted-foreground">{criterion.index}.</span>
                                            {t(criterion.labelKey)}
                                        </span>
                                        <div className="flex shrink-0 gap-1">
                                            {CRITERION_LEVELS.map((level) => (
                                                <button
                                                    key={level}
                                                    type="button"
                                                    onClick={() => setScores((current) => ({ ...current, [criterion.index]: level }))}
                                                    className={`w-11 rounded-md px-1 py-1 text-xs font-bold tabular-nums transition-colors ${
                                                        scores[criterion.index] === level
                                                            ? "bg-violet-600 text-white"
                                                            : "border border-violet-200 bg-background text-muted-foreground hover:bg-violet-100"
                                                    }`}
                                                >
                                                    {String(level).replace(".", ",")}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    <p className="text-xs font-bold text-violet-800 dark:text-violet-300">
                        {t("essayTotalLabel")}:{" "}
                        <span className="tabular-nums">
                            {String(total).replace(".", ",")} / {ESSAY_MAX_POINTS}
                        </span>
                        {!complete && (
                            <span className="ml-2 font-semibold text-amber-700 dark:text-amber-500">
                                {t("essayCriteriaIncomplete")} ({chosen.length}/{ESSAY_CRITERIA.length})
                            </span>
                        )}
                    </p>
                </div>
            ) : (
                <p className="mt-3 rounded-lg bg-background/70 p-2 text-xs leading-relaxed text-muted-foreground">
                    {t("essayVerdictHint")}
                    {verdictPoints !== null && (
                        <span className="ml-1 font-bold text-foreground tabular-nums">
                            {verdictPoints} / {maxPoints}
                        </span>
                    )}
                </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder={t("commentPlaceholder")}
                    className="w-full flex-1 rounded-lg border border-violet-200 bg-background px-3 py-2 text-sm sm:w-auto sm:min-w-[220px]"
                />
                <button
                    type="button"
                    onClick={() => onSubmit({ verdict, criteria: chosen, feedback })}
                    disabled={saving || !canSave}
                    className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                    {saving ? t("saving") : saveLabel}
                </button>
            </div>
        </div>
    );
}
