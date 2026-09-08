"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck, ShieldAlert, Info } from "lucide-react";
import { MockReliability } from "@/lib/class-utils";
import { RELIABILITY_HIGH_STAKES } from "@/lib/rasch-separation";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Надёжность варианта. ТЗ §N.5.
//
// Ничего не считает — показывает то, что записал /api/rasch/recalculate.
// Модель, θ, калибровка, шкала и пороги здесь не участвуют.
//
// ═══ ЧТО ЭТО ЗА ЭКРАН И КОМУ ═══
//
// Это характеристика ТЕСТА, а не ученика, поэтому блок стоит в отчёте по моку,
// свёрнут по умолчанию и не смешан с рейтингом. Ученику он ничего не говорит;
// методисту говорит, можно ли на этих баллах строить решения.
//
// Главное число — person reliability, и читать его надо как «доля разброса
// баллов, которая является настоящей разницей между учениками, а не шумом
// измерения». 0.5 значит, что половина различий в рейтинге — шум.
//
// ═══ ПОЧЕМУ РЯДОМ ЛЕЖИТ ЧИСЛО «СО ВСЕМИ РАБОТАМИ» ═══
//
// Основной расчёт исключает крайние баллы: у работы с нулём верных способности
// по Рашу не существует, её SE назначена соглашением, а в RMSE входит
// квадратом. На математике одна такая работа роняет надёжность с 0.736 до
// 0.495. Прятать это нельзя — иначе исключение выглядит как подгонка, — поэтому
// оба числа стоят рядом и подписаны.

export type MockReliabilityPanelProps = { reliability: MockReliability | null };

const fmt = (v: number | null, digits = 2) =>
    v === null || !Number.isFinite(v) ? "—" : v.toFixed(digits);

// Явная карта, а не `status_${...}`: ключ переводчика типизирован по словарю,
// и шаблонная строка расширилась бы до string — опечатка перестала бы быть
// ошибкой сборки.
const STATUS_KEY = {
    OK: "statusOk",
    NOT_SEPARABLE: "statusNotSeparable",
    TOO_FEW: "statusTooFew",
} as const;

export default function MockReliabilityPanel({ reliability }: MockReliabilityPanelProps) {
    const t = useTranslations("mockReliability");
    const [open, setOpen] = useState(false);

    if (!reliability) return null;

    const {
        personReliability, personSeparation, personStrata, personStatus,
        personMeasureCount, personExtremeCount, personReliabilityWithExtremes,
        itemReliability, itemSeparation, itemMeasureCount, itemStatus,
    } = reliability;

    // §217: «не удалось разделить» — это не нулевая надёжность. Пока статуса OK
    // нет, показывается причина, а не число.
    const measured = personStatus === "OK" && personReliability !== null;
    const meets = measured && personReliability >= RELIABILITY_HIGH_STAKES;

    return (
        <div className="rounded-2xl border border-border bg-card">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
                <div className="flex items-center gap-3">
                    {meets
                        ? <ShieldCheck size={18} className="shrink-0 text-emerald-600" />
                        : <ShieldAlert size={18} className="shrink-0 text-amber-600" />}
                    <div>
                        <p className="text-sm font-bold text-foreground">{t("title")}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {measured
                                ? t(meets ? "headlineOk" : "headlineLow")
                                    .replace("{value}", fmt(personReliability, 3))
                                    .replace("{threshold}", String(RELIABILITY_HIGH_STAKES))
                                : t(STATUS_KEY[personStatus as keyof typeof STATUS_KEY] ?? "statusTooFew")}
                        </p>
                    </div>
                </div>
                <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="border-t border-border px-5 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        {/* Ученики */}
                        <div className="rounded-xl bg-muted/50 p-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                {t("personTitle")}
                            </p>
                            <p className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">
                                {measured ? fmt(personReliability, 3) : "—"}
                            </p>
                            <dl className="mt-3 space-y-1.5 text-xs">
                                <Row label={t("separation")} value={fmt(personSeparation)} />
                                {/* Straта отвечает на «§N.5: на сколько различимых
                                    уровней тест делит учеников» словами, а не
                                    отношением. */}
                                <Row label={t("strata")} value={fmt(personStrata, 1)} />
                                <Row label={t("measured")} value={String(personMeasureCount ?? "—")} />
                                {(personExtremeCount ?? 0) > 0 && (
                                    <Row
                                        label={t("excluded")}
                                        value={String(personExtremeCount)}
                                        hint={t("excludedHint")}
                                    />
                                )}
                                {/* Цена исключения — числом, а не на словах. */}
                                {(personExtremeCount ?? 0) > 0 && personReliabilityWithExtremes !== null && (
                                    <Row
                                        label={t("withExtremes")}
                                        value={fmt(personReliabilityWithExtremes, 3)}
                                    />
                                )}
                            </dl>
                        </div>

                        {/* Задания */}
                        <div className="rounded-xl bg-muted/50 p-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                {t("itemTitle")}
                            </p>
                            <p className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">
                                {itemStatus === "OK" ? fmt(itemReliability, 3) : "—"}
                            </p>
                            <dl className="mt-3 space-y-1.5 text-xs">
                                <Row label={t("separation")} value={fmt(itemSeparation)} />
                                <Row label={t("measured")} value={String(itemMeasureCount ?? "—")} />
                            </dl>
                            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                                {t("itemExplain")}
                            </p>
                        </div>
                    </div>

                    <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                        <Info size={13} className="mt-0.5 shrink-0" />
                        <span>
                            {t("benchmark").replace("{threshold}", String(RELIABILITY_HIGH_STAKES))}
                            {" "}
                            {t("cohortNote")}
                        </span>
                    </p>
                </div>
            )}
        </div>
    );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">
                {label}
                {hint && <span className="ml-1 text-[10px] opacity-70">({hint})</span>}
            </dt>
            <dd className="font-bold tabular-nums text-foreground">{value}</dd>
        </div>
    );
}
