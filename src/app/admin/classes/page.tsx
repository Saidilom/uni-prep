"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Users, User as UserIcon, GraduationCap, ChevronRight, Building2 } from "lucide-react";
import { fetchAdminClassesOverview, fetchBranches, AdminClassSummary, Branch } from "@/lib/class-utils";
import { accuracyColor } from "@/lib/status-colors";
import { formatScore, certificatePercent, CERTIFICATE_MAX } from "@/lib/certificate-scale";
import { pluralizeRu } from "@/lib/pluralize-ru";
import { CoreSubject } from "@/lib/mock-import-schema";
import FilterChip from "@/components/filter-chip";
import {
    subjectTabs, filterBySubject, sortBySubject,
    SUBJECT_ALL, SUBJECT_NONE, SubjectFilterValue,
} from "@/lib/class-subject-filter";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

const FILTER_ALL = "__all__";
const FILTER_NONE = "__none__";

export default function AdminClassesPage() {
    const [classes, setClasses] = useState<AdminClassSummary[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    // Три состояния, а не два: ALL — все группы, NONE — группы без филиала,
    // иначе id филиала. Первые два держатся отдельными метками, потому что
    // «показать все» и «показать бесхозные» это разные вопросы, и null не мог
    // бы значить оба сразу. Метки не uuid, поэтому с id не столкнутся.
    const [branchFilter, setBranchFilter] = useState<string>(FILTER_ALL);
    const [subjectFilter, setSubjectFilter] = useState<SubjectFilterValue>(SUBJECT_ALL);
    const [loading, setLoading] = useState(true);
    const { locale } = useLocale();
    const t = useTranslations("adminClasses");
    const tSubjects = useTranslations("mockTestStudio");
    const subjectLabels: Record<CoreSubject, string> = useMemo(() => ({
        math: tSubjects("subjectMath"),
        physics: tSubjects("subjectPhysics"),
        chemistry: tSubjects("subjectChemistry"),
        biology: tSubjects("subjectBiology"),
        history: tSubjects("subjectHistory"),
        english: tSubjects("subjectEnglish"),
        native: tSubjects("subjectNative"),
    }), [tSubjects]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const [rows, branchRows] = await Promise.all([
                fetchAdminClassesOverview(),
                fetchBranches().catch(() => [] as Branch[]),
            ]);
            setClasses(rows);
            setBranches(branchRows);
            setLoading(false);
        })();
    }, []);

    const branchNameById = useMemo(
        () => new Map(branches.map((b) => [b.id, b.name])),
        [branches],
    );

    // Сколько групп в каждом филиале — считается по ВСЕМ группам, а не по
    // отфильтрованным: иначе счётчик на вкладке менялся бы от того, что она же
    // и выбрана.
    const countByBranch = useMemo(() => {
        const counts = new Map<string | null, number>();
        classes.forEach((c) => {
            const key = c.branchId ?? null;
            counts.set(key, (counts.get(key) ?? 0) + 1);
        });
        return counts;
    }, [classes]);

    // Показываем только те филиалы, где группы есть, плюс «без филиала», если
    // такие группы встречаются. Пустые вкладки — шум.
    const tabs = useMemo(() => {
        const withClasses = branches.filter((b) => (countByBranch.get(b.id) ?? 0) > 0);
        const orphanCount = countByBranch.get(null) ?? 0;
        return { withClasses, orphanCount };
    }, [branches, countByBranch]);

    // Отбор по филиалу — первым: вкладки предметов ниже считаются по УЖЕ
    // отобранному филиалу, иначе они обещали бы группы, которых в этом
    // филиале нет.
    const byBranch = useMemo(() => {
        if (branchFilter === FILTER_ALL) return classes;
        if (branchFilter === FILTER_NONE) return classes.filter((c) => !c.branchId);
        return classes.filter((c) => c.branchId === branchFilter);
    }, [classes, branchFilter]);

    const subjects = useMemo(() => subjectTabs(byBranch), [byBranch]);

    // Порядок по предмету нужен именно когда выбраны «все»: иначе группы
    // одного предмета разбросаны по списку — с этого и начался разговор.
    const visibleClasses = useMemo(
        () => sortBySubject(filterBySubject(byBranch, subjectFilter)),
        [byBranch, subjectFilter],
    );

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t("subtitle")}
                </p>
            </section>

            {/* Фильтр по филиалу. Показывается только когда фильтровать есть
                что: на одном филиале вкладки были бы декорацией. */}
            {!loading && (tabs.withClasses.length > 1 || tabs.orphanCount > 0) && (
                <section className="flex flex-wrap items-center gap-2">
                    <FilterChip
                        label={t("allBranches")}
                        count={classes.length}
                        active={branchFilter === FILTER_ALL}
                        onClick={() => { setBranchFilter(FILTER_ALL); setSubjectFilter(SUBJECT_ALL); }}
                    />
                    {tabs.withClasses.map((b) => (
                        <FilterChip
                            key={b.id}
                            label={b.name}
                            count={countByBranch.get(b.id) ?? 0}
                            active={branchFilter === b.id}
                            onClick={() => { setBranchFilter(b.id); setSubjectFilter(SUBJECT_ALL); }}
                        />
                    ))}
                    {tabs.orphanCount > 0 && (
                        <FilterChip
                            label={t("noBranchFilter")}
                            count={tabs.orphanCount}
                            active={branchFilter === FILTER_NONE}
                            onClick={() => { setBranchFilter(FILTER_NONE); setSubjectFilter(SUBJECT_ALL); }}
                        />
                    )}
                </section>
            )}

            {/* Предметы. Показываются ВСЕ, включая те, где групп нет: по набору
                из двух вкладок не видно, что предметов вообще семь. Счётчики
                считаются по выбранному филиалу, поэтому при его смене набор
                чисел меняется вместе с ним. */}
            {!loading && (
                <section className="flex flex-wrap items-center gap-2">
                    <FilterChip
                        label={t("allSubjects")}
                        count={byBranch.length}
                        active={subjectFilter === SUBJECT_ALL}
                        onClick={() => setSubjectFilter(SUBJECT_ALL)}
                    />
                    {subjects.map((tab) => (
                        <FilterChip
                            key={tab.value}
                            label={tab.value === SUBJECT_NONE ? t("noSubjectFilter") : subjectLabels[tab.value]}
                            count={tab.count}
                            active={subjectFilter === tab.value}
                            onClick={() => setSubjectFilter(tab.value)}
                        />
                    ))}
                </section>
            )}

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : classes.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <Users size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("noClassesYet")}</p>
                        <p className="mt-1 text-sm text-muted-foreground/70">{t("noClassesHint")}</p>
                    </div>
                ) : visibleClasses.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <Users size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("noClassesInBranch")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {visibleClasses.map((c) => (
                            <Link
                                key={c.id}
                                href={`/admin/classes/${c.id}`}
                                className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                            >
                                <div className="flex min-w-0 items-center gap-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                                        <GraduationCap size={18} />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{c.name}</p>
                                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <UserIcon size={12} /> {c.teacherName}
                                            {c.subjectId && <span className="rounded-lg bg-muted px-2 py-0.5 font-semibold">{subjectLabels[c.subjectId as CoreSubject] ?? c.subjectId}</span>}
                                            {/* Филиал в самой строке: без него список
                                                групп остаётся «смешанным» ровно до тех
                                                пор, пока фильтр не нажали. */}
                                            <span className="inline-flex items-center gap-1 rounded-lg bg-[hsl(var(--brand-olive-soft))] px-2 py-0.5 font-semibold text-[hsl(var(--brand-olive-ink))]">
                                                <Building2 size={11} />
                                                {c.branchId ? branchNameById.get(c.branchId) ?? t("unknownBranch") : t("noBranchFilter")}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
                                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
                                        <Users size={13} /> {c.memberCount} {locale === "ru" ? pluralizeRu(c.memberCount, ["ученик", "ученика", "учеников"]) : t("studentWord")}
                                    </span>
                                    <span className={`rounded-xl px-3 py-2 text-xs font-extrabold tabular-nums ${accuracyColor(certificatePercent(c.avgScore, CERTIFICATE_MAX))}`}>
                                        {c.avgScore !== null ? formatScore(c.avgScore) : "—"}
                                    </span>
                                    <ChevronRight size={16} className="text-muted-foreground" />
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
