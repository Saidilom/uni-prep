"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Activity, Crosshair } from "lucide-react";
import { fetchMockMeasures, MockMeasures } from "@/lib/class-utils";
import {
    buildTif, buildTcc, buildIcc, buildWrightMap, thetaRangeFor,
    TifCurve, WrightMap,
} from "@/lib/rasch-curves";
import { useTranslations } from "@/lib/i18n/locale-provider";
import PanelSkeleton from "@/components/panel-skeleton";

// Психометрические графики. ТЗ §D.3 (TIF), §D.10 (карта Райта),
// §D.11 (TCC), §D.12 (ICC).
//
// Ничего не оценивает: берёт готовые b и θ и раскладывает их по сетке
// функциями из rasch-curves.ts. Ни модель, ни калибровка, ни шкала здесь не
// участвуют, ни один балл от этого экрана не зависит.
//
// ═══ ПОЧЕМУ SVG РУКАМИ, А НЕ БИБЛИОТЕКА ═══
//
// Библиотеки графиков в проекте нет, а ради четырёх кривых тянуть её в бандл
// не стоит: всё, что здесь нужно, — перевести пару чисел в координаты. Заодно
// разметка нацеливания (пик TIF и центр когорты) рисуется как часть графика, а
// не пристраивается поверх чужого компонента.
//
// ═══ ЧТО ЧИТАТЬ НА КАЖДОМ ГРАФИКЕ ═══
//
// TIF — где тест точнее. Две вертикали: оптимум теста и центр когорты. Чем
// дальше они друг от друга, тем больше точности потрачено впустую (§D.9).
//
// Карта Райта — самый прямой ответ про нацеливание. На реальном моке
// математики 13 заданий из 55 стоят ВЫШЕ способности сильнейшего ученика:
// решить их не мог никто, и они не измеряют ничего.
//
// TCC — ожидаемый сырой балл. Объясняет нелинейность: в середине один верный
// ответ стоит меньше логит, чем на краях.
//
// ICC — по кривой на задание. Наклон у всех одинаков (это и есть модель Раша),
// поэтому видно только разброс сложностей.

export type PsychometricChartsProps = { mockTestId: string };

const W = 520;
const H = 170;
const PAD = { left: 34, right: 12, top: 12, bottom: 26 };

type Scale = { x: (v: number) => number; y: (v: number) => number };

function makeScale(xMin: number, xMax: number, yMin: number, yMax: number): Scale {
    const w = W - PAD.left - PAD.right;
    const h = H - PAD.top - PAD.bottom;
    const xSpan = xMax - xMin || 1;
    const ySpan = yMax - yMin || 1;
    return {
        x: (v) => PAD.left + ((v - xMin) / xSpan) * w,
        y: (v) => PAD.top + h - ((v - yMin) / ySpan) * h,
    };
}

const path = (points: Array<{ x: number; y: number }>) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

/** Подписи оси θ: круглые логиты внутри диапазона. */
function thetaTicks(min: number, max: number): number[] {
    const step = max - min > 6 ? 2 : 1;
    const ticks: number[] = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
    return ticks;
}

function Frame({ children, xMin, xMax, scale, yLabel }: {
    children: React.ReactNode; xMin: number; xMax: number; scale: Scale; yLabel: string;
}) {
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
            {/* Ось θ */}
            <line
                x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom}
                className="stroke-border" strokeWidth={1}
            />
            {thetaTicks(xMin, xMax).map((t) => (
                <g key={t}>
                    <line
                        x1={scale.x(t)} x2={scale.x(t)} y1={H - PAD.bottom} y2={H - PAD.bottom + 3}
                        className="stroke-border" strokeWidth={1}
                    />
                    <text
                        x={scale.x(t)} y={H - PAD.bottom + 14} textAnchor="middle"
                        className="fill-muted-foreground text-[9px] tabular-nums"
                    >
                        {t > 0 ? `+${t}` : t}
                    </text>
                </g>
            ))}
            <text x={2} y={PAD.top + 4} className="fill-muted-foreground text-[9px]">{yLabel}</text>
            {children}
        </svg>
    );
}

const fmt = (v: number | null | undefined, d = 2) =>
    v === null || v === undefined || !Number.isFinite(v) ? "—" : (v >= 0 ? "+" : "") + v.toFixed(d);

export default function PsychometricCharts({ mockTestId }: PsychometricChartsProps) {
    const t = useTranslations("psychometricCharts");
    const [measures, setMeasures] = useState<MockMeasures | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let active = true;
        (async () => {
            const data = await fetchMockMeasures(mockTestId);
            if (active) setMeasures(data);
        })();
        return () => { active = false; };
    }, [mockTestId]);

    const model = useMemo(() => {
        if (!measures || measures.difficulties.length === 0) return null;
        const range = thetaRangeFor(measures.abilities, measures.difficulties);
        return {
            range,
            // Кривым нужны все три параметра: под 3PL наклон задаёт a, нижнюю
            // асимптоту — c. Карте Райта по-прежнему достаточно трудностей: она
            // расставляет задания и учеников на одной оси, а не рисует кривые.
            tif: buildTif(measures.items, measures.abilities, range),
            tcc: buildTcc(measures.items, range),
            wright: buildWrightMap(measures.abilities, measures.difficulties, range),
            iccs: measures.items.map((item) => buildIcc(item, range, 81)),
        };
    }, [measures]);

    // Грузится — держим место заглушкой; мер нет — графиков нет вовсе.
    if (!measures) return <PanelSkeleton />;
    if (!model) return null;
    const { range, tif, tcc, wright, iccs } = model;

    return (
        <div className="rounded-2xl border border-border bg-card">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
                <div className="flex items-center gap-3">
                    <Activity size={18} className="shrink-0 text-primary" />
                    <div>
                        <p className="text-sm font-bold text-foreground">{t("title")}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {/* Сразу в шапке — главный вывод, а не «откройте и разберитесь». */}
                            {wright.itemsAbovePersons > 0
                                ? t("headlineMismatch")
                                    .replace("{above}", String(wright.itemsAbovePersons))
                                    .replace("{total}", String(measures!.difficulties.length))
                                    .replace("{gap}", fmt(tif.targetingGap, 1))
                                : t("headlineOk").replace("{gap}", fmt(tif.targetingGap, 1))}
                        </p>
                    </div>
                </div>
                <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="space-y-5 border-t border-border px-5 py-4">
                    <TifChart tif={tif} range={range} t={t} />
                    <WrightChart map={wright} t={t} />
                    <TccChart tcc={tcc} range={range} tif={tif} t={t} />
                    <IccChart iccs={iccs} range={range} t={t} />
                </div>
            )}
        </div>
    );
}

// Не `(key: string) => string`: ключи переводчика типизированы по словарю, и
// такая аннотация расширила бы их до string — опечатка в ключе перестала бы
// быть ошибкой сборки. Тип берётся у самой функции.
type T = ReturnType<typeof useTranslations<"psychometricCharts">>;

// ─────────────────────────── TIF (§D.3, D.9) ───────────────────────────

function TifChart({ tif, range, t }: { tif: TifCurve; range: { min: number; max: number }; t: T }) {
    const maxInfo = Math.max(...tif.points.map((p) => p.information));
    const scale = makeScale(range.min, range.max, 0, maxInfo * 1.1);
    const line = path(tif.points.map((p) => ({ x: scale.x(p.theta), y: scale.y(p.information) })));
    const area = `${line} L${scale.x(range.max)} ${scale.y(0)} L${scale.x(range.min)} ${scale.y(0)} Z`;

    return (
        <section>
            <ChartHeading title={t("tifTitle")} hint={t("tifHint")} />
            <Frame xMin={range.min} xMax={range.max} scale={scale} yLabel={t("axisInformation")}>
                <path d={area} className="fill-primary/10" />
                <path d={line} className="stroke-primary" strokeWidth={1.8} fill="none" />

                {/* Оптимум теста. */}
                <Marker
                    x={scale.x(tif.peak.theta)} label={t("peakLabel")}
                    className="stroke-primary" textClassName="fill-primary"
                />
                {/* Центр когорты. Разрыв между двумя вертикалями и есть
                    рассогласование нацеливания (§D.9). */}
                {tif.cohort && (
                    <Marker
                        x={scale.x(tif.cohort.mean)} label={t("cohortLabel")}
                        className="stroke-amber-500" textClassName="fill-amber-600" dashed
                    />
                )}
            </Frame>

            <dl className="mt-1 grid gap-1 text-[11px] sm:grid-cols-2">
                <Stat label={t("peakAt")} value={`θ = ${fmt(tif.peak.theta)} · SE ±${fmt(tif.peak.se, 2)}`} />
                {tif.cohort && (
                    <Stat label={t("cohortAt")} value={`θ = ${fmt(tif.cohort.mean)} · SE ±${fmt(tif.atCohort?.se, 2)}`} />
                )}
            </dl>
            {tif.targetingGap !== null && tif.sePenalty !== null && (
                <p className="mt-1.5 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-foreground">
                    <Crosshair size={13} className="mt-0.5 shrink-0 text-amber-600" />
                    <span>
                        {t("targeting")
                            .replace("{gap}", fmt(tif.targetingGap, 2))
                            .replace("{penalty}", tif.sePenalty.toFixed(2))}
                    </span>
                </p>
            )}
        </section>
    );
}

function Marker({ x, label, className, textClassName, dashed }: {
    x: number; label: string; className: string; textClassName: string; dashed?: boolean;
}) {
    return (
        <g>
            <line
                x1={x} x2={x} y1={PAD.top} y2={H - PAD.bottom}
                className={className} strokeWidth={1.4}
                strokeDasharray={dashed ? "4 3" : undefined}
            />
            <text
                x={x} y={PAD.top - 2} textAnchor="middle"
                className={`${textClassName} text-[9px] font-bold`}
            >
                {label}
            </text>
        </g>
    );
}

// ─────────────────────────── Карта Райта (§D.10) ───────────────────────────

// Диапазон оси сюда не передаётся: корзины уже несут свои границы, и второй
// источник тех же чисел мог бы с ними разойтись.
function WrightChart({ map, t }: { map: WrightMap; t: T }) {
    const maxCount = Math.max(1, ...map.bins.map((b) => Math.max(b.persons, b.items)));
    const rowHeight = 11;
    const height = map.bins.length * rowHeight + 22;
    const mid = W / 2;
    const half = (W / 2) - 46;

    return (
        <section>
            <ChartHeading title={t("wrightTitle")} hint={t("wrightHint")} />
            <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img">
                <text x={mid - half} y={9} textAnchor="start" className="fill-muted-foreground text-[9px] font-bold">
                    {t("wrightPersons")}
                </text>
                <text x={mid + half} y={9} textAnchor="end" className="fill-muted-foreground text-[9px] font-bold">
                    {t("wrightItems")}
                </text>
                {/* Сверху вниз — от сильных к слабым, как принято на карте Райта. */}
                {[...map.bins].reverse().map((bin, i) => {
                    const y = 16 + i * rowHeight;
                    const pw = (bin.persons / maxCount) * half;
                    const iw = (bin.items / maxCount) * half;
                    // Полоса, где ученики есть, а заданий нет: измерять нечем.
                    const gap = bin.persons > 0 && bin.items === 0;
                    return (
                        <g key={bin.center}>
                            {gap && (
                                <rect
                                    x={PAD.left} y={y - 1} width={W - PAD.left - PAD.right} height={rowHeight - 1}
                                    className="fill-amber-500/10"
                                />
                            )}
                            <rect
                                x={mid - 22 - pw} y={y} width={pw} height={rowHeight - 3}
                                className="fill-primary" rx={1}
                            />
                            <rect
                                x={mid + 22} y={y} width={iw} height={rowHeight - 3}
                                className="fill-muted-foreground/50" rx={1}
                            />
                            <text
                                x={mid} y={y + rowHeight - 4} textAnchor="middle"
                                className="fill-muted-foreground text-[8px] tabular-nums"
                            >
                                {fmt(bin.center, 1)}
                            </text>
                        </g>
                    );
                })}
            </svg>
            <dl className="mt-1 grid gap-1 text-[11px] sm:grid-cols-2">
                {map.persons && (
                    <Stat label={t("personsRange")} value={`${fmt(map.persons.min)} … ${fmt(map.persons.max)}`} />
                )}
                {map.items && (
                    <Stat label={t("itemsRange")} value={`${fmt(map.items.min)} … ${fmt(map.items.max)}`} />
                )}
            </dl>
            {/* Самый прямой счётчик нацеливания — заданий, которые не мог
                решить никто. */}
            {map.itemsAbovePersons > 0 && (
                <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                    {t("itemsAbove").replace("{count}", String(map.itemsAbovePersons))}
                </p>
            )}
            {map.itemsBelowPersons > 0 && (
                <p className="mt-1.5 rounded-lg bg-muted px-3 py-2 text-[11px] font-semibold leading-relaxed text-muted-foreground">
                    {t("itemsBelow").replace("{count}", String(map.itemsBelowPersons))}
                </p>
            )}
        </section>
    );
}

// ─────────────────────────── TCC (§D.11) ───────────────────────────

function TccChart({ tcc, range, tif, t }: {
    tcc: { itemCount: number; points: Array<{ theta: number; expectedScore: number }> };
    range: { min: number; max: number }; tif: TifCurve; t: T;
}) {
    const scale = makeScale(range.min, range.max, 0, tcc.itemCount);
    const line = path(tcc.points.map((p) => ({ x: scale.x(p.theta), y: scale.y(p.expectedScore) })));
    const atCohort = tif.cohort
        ? tcc.points.reduce((best, p) =>
            Math.abs(p.theta - tif.cohort!.mean) < Math.abs(best.theta - tif.cohort!.mean) ? p : best)
        : null;

    return (
        <section>
            <ChartHeading title={t("tccTitle")} hint={t("tccHint")} />
            <Frame xMin={range.min} xMax={range.max} scale={scale} yLabel={t("axisRawScore")}>
                <path d={line} className="stroke-primary" strokeWidth={1.8} fill="none" />
                {atCohort && (
                    <>
                        <Marker
                            x={scale.x(atCohort.theta)} label={t("cohortLabel")}
                            className="stroke-amber-500" textClassName="fill-amber-600" dashed
                        />
                        <circle
                            cx={scale.x(atCohort.theta)} cy={scale.y(atCohort.expectedScore)} r={3}
                            className="fill-amber-500"
                        />
                    </>
                )}
            </Frame>
            {atCohort && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("tccAtCohort")
                        .replace("{score}", atCohort.expectedScore.toFixed(1))
                        .replace("{total}", String(tcc.itemCount))}
                </p>
            )}
        </section>
    );
}

// ─────────────────────────── ICC (§D.12) ───────────────────────────

function IccChart({ iccs, range, t }: {
    iccs: Array<{ difficulty: number; points: Array<{ theta: number; probability: number }> }>;
    range: { min: number; max: number }; t: T;
}) {
    const scale = makeScale(range.min, range.max, 0, 1);
    // Все кривые бледно + три опорные (самое лёгкое, среднее, самое трудное)
    // ярко: пятьдесят одинаковых линий не читаются, а разброс сложностей виден
    // именно на всех сразу.
    const sorted = [...iccs].sort((a, b) => a.difficulty - b.difficulty);
    const highlight = sorted.length >= 3
        ? [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]]
        : sorted;

    return (
        <section>
            <ChartHeading title={t("iccTitle")} hint={t("iccHint")} />
            <Frame xMin={range.min} xMax={range.max} scale={scale} yLabel={t("axisProbability")}>
                <line
                    x1={PAD.left} x2={W - PAD.right} y1={scale.y(0.5)} y2={scale.y(0.5)}
                    className="stroke-border" strokeWidth={1} strokeDasharray="3 3"
                />
                {sorted.map((icc) => (
                    <path
                        key={icc.difficulty}
                        d={path(icc.points.map((p) => ({ x: scale.x(p.theta), y: scale.y(p.probability) })))}
                        className="stroke-muted-foreground/25" strokeWidth={1} fill="none"
                    />
                ))}
                {highlight.map((icc) => (
                    <g key={`hl-${icc.difficulty}`}>
                        <path
                            d={path(icc.points.map((p) => ({ x: scale.x(p.theta), y: scale.y(p.probability) })))}
                            className="stroke-primary" strokeWidth={1.8} fill="none"
                        />
                        {/* Точка перегиба стоит ровно на b — это и есть смысл
                            меры сложности. */}
                        <circle cx={scale.x(icc.difficulty)} cy={scale.y(0.5)} r={2.5} className="fill-primary" />
                    </g>
                ))}
            </Frame>
            <p className="mt-1 text-[11px] text-muted-foreground">
                {t("iccHighlighted")
                    .replace("{easy}", fmt(sorted[0]?.difficulty))
                    .replace("{hard}", fmt(sorted[sorted.length - 1]?.difficulty))}
            </p>
        </section>
    );
}

// ─────────────────────────── общее ───────────────────────────

function ChartHeading({ title, hint }: { title: string; hint: string }) {
    return (
        <div className="mb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-bold tabular-nums text-foreground">{value}</dd>
        </div>
    );
}
