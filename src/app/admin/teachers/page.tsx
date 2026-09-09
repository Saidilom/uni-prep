"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Mail, Phone, Users, Trophy, ChevronDown, ChevronRight } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { User as UserType } from "@/lib/firestore-schema";
import { pluralizeRu } from "@/lib/pluralize-ru";
import { fetchAdminTeachersOverview, fetchAdminClassesOverview, AdminClassSummary, prefetchClassDetail} from "@/lib/class-utils";
import { accuracyColor } from "@/lib/status-colors";
import { formatScore, certificatePercent, CERTIFICATE_MAX } from "@/lib/certificate-scale";
import { CoreSubject } from "@/lib/mock-import-schema";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

type TeacherRow = UserType & { shortid?: string; classCount: number; avgScore: number | null; attemptCount: number };

export default function AdminTeachersPage() {
    const [teachers, setTeachers] = useState<TeacherRow[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    // Группы учителей. Один загрузчик на всю платформу — тот же, что у раздела
    // «Группы», — вместо запроса на каждого учителя.
    const [classes, setClasses] = useState<AdminClassSummary[]>([]);
    // Раскрыт ровно один учитель: десять развёрнутых списков превращают
    // страницу в простыню.
    const [openTeacherId, setOpenTeacherId] = useState<string | null>(null);
    const { locale } = useLocale();
    const t = useTranslations("adminTeachers");
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

    const load = async () => {
        setLoading(true);
        const { data: users } = await supabase.from("users").select("*").eq("role", "teacher").order("createdAt", { ascending: false });
        const teacherRows = (users ?? []) as TeacherRow[];
        if (teacherRows.length > 0) {
            // Один проход по всем группам платформы вместо запроса на учителя:
            // отсюда же берётся и количество групп, и средний скор учеников.
            const overview = await fetchAdminTeachersOverview();
            teacherRows.forEach((row) => {
                const stats = overview.get(row.id);
                row.classCount = stats?.classCount ?? 0;
                row.avgScore = stats?.avgScore ?? null;
                row.attemptCount = stats?.attemptCount ?? 0;
            });
        }
        setTeachers(teacherRows);
        setClasses(await fetchAdminClassesOverview().catch(() => [] as AdminClassSummary[]));
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const filtered = teachers.filter((teacher) =>
        (teacher.name + " " + (teacher.surname || "") + " " + (teacher.email || "")).toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t("subtitlePrefix")}{" "}
                    <Link href="/admin/users" className="font-semibold text-[hsl(var(--brand-blue-ink))] hover:underline">{t("usersLinkLabel")}</Link>.
                </p>
                <div className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3">
                    <Search size={16} className="shrink-0 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t("searchPlaceholder")}
                        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                </div>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <Users size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{teachers.length === 0 ? t("noTeachersYet") : t("noResultsFound")}</p>
                        {teachers.length === 0 && (
                            <p className="mt-1 text-sm text-muted-foreground/70">
                                {t("assignTeacherRoleHint")}
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((teacher) => {
                        const own = classes.filter((c) => c.teacherId === teacher.id);
                        const expanded = openTeacherId === teacher.id;
                        return (
                            <div key={teacher.id} className="rounded-2xl border border-border bg-card">
                              <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))]/10 font-bold text-[hsl(var(--brand-blue-ink))]">
                                        {teacher.name?.[0]?.toUpperCase() || "?"}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{teacher.name} {teacher.surname || ""}</p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            {teacher.email && <span className="flex items-center gap-1"><Mail size={12} />{teacher.email}</span>}
                                            {teacher.phone && <span className="flex items-center gap-1"><Phone size={12} />{teacher.phone}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-auto">
                                    {/* Число групп стало кнопкой: по нему и раскрывается,
                                        какие это группы. Отдельная ссылка «показать»
                                        рядом с тем же числом была бы лишней. */}
                                    <button
                                        onClick={() => setOpenTeacherId(expanded ? null : teacher.id)}
                                        disabled={own.length === 0}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors enabled:hover:bg-muted/60 disabled:opacity-60"
                                    >
                                        <Users size={13} /> {teacher.classCount} {locale === "ru" ? pluralizeRu(teacher.classCount, ["группа", "группы", "групп"]) : t("groupWord")}
                                        {own.length > 0 && (
                                            <ChevronDown size={13} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                                        )}
                                    </button>
                                    {/* Средний БАЛЛ учеников этого учителя по шкале 75 —
                                        не процент: fetchAdminTeachersOverview приводит все
                                        предметы к одной шкале до усреднения. Поэтому и цвет
                                        считается через certificatePercent: accuracyColor
                                        сравнивает с порогами 80 и 50, то есть ждёт процент. */}
                                    <span className="inline-flex flex-col items-center rounded-xl border border-border px-3 py-1.5">
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{t("avgScoreLabel")}</span>
                                        {teacher.avgScore !== null ? (
                                            <span className={`mt-0.5 rounded-lg px-2 py-0.5 text-xs font-extrabold tabular-nums ${accuracyColor(certificatePercent(teacher.avgScore, CERTIFICATE_MAX))}`}>
                                                {formatScore(teacher.avgScore)}
                                            </span>
                                        ) : (
                                            <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                                                <Trophy size={11} /> {t("noScoresYet")}
                                            </span>
                                        )}
                                    </span>
                                </div>
                              </div>

                              {/* Группы этого учителя. Каждая ведёт на тот же экран
                                  группы, что и раздел «Группы», — с составом,
                                  результатами по каждому моку и разбором по вопросам. */}
                              {expanded && own.length > 0 && (
                                <ul className="space-y-2 border-t border-border px-5 py-4">
                                    {own.map((c) => (
                                        <li key={c.id}>
                                            <Link
                                                href={`/admin/classes/${c.id}`}
                                                onMouseEnter={() => prefetchClassDetail(c.id)}
                                                onFocus={() => prefetchClassDetail(c.id)}
                                                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 transition-colors hover:bg-muted/40"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                                                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                        <span>{t("studentsInClass").replace("{count}", String(c.memberCount))}</span>
                                                        {c.subjectId && (
                                                            <span className="rounded-lg bg-muted px-2 py-0.5 font-semibold">
                                                                {subjectLabels[c.subjectId as CoreSubject] ?? c.subjectId}
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    <span className={`rounded-lg px-2.5 py-1 text-xs font-extrabold tabular-nums ${accuracyColor(certificatePercent(c.avgScore, CERTIFICATE_MAX))}`}>
                                                        {c.avgScore !== null ? formatScore(c.avgScore) : "—"}
                                                    </span>
                                                    <ChevronRight size={15} className="text-muted-foreground" />
                                                </div>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
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
