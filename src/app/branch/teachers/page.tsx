"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GraduationCap, Mail, Phone, Users, Search, UserPlus, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { User as UserType } from "@/lib/firestore-schema";
import {
    fetchAdminTeachersOverview,
    searchBranchTeacherCandidates,
    promoteStudentToTeacherInBranch,
    assignTeacherToBranch,
    fetchAdminClassesOverview,
    BranchTeacherCandidate,
    AdminClassSummary,
} from "@/lib/class-utils";
import { useToast } from "@/hooks/useToast";
import { accuracyColor } from "@/lib/status-colors";
import { formatScore, certificatePercent, CERTIFICATE_MAX } from "@/lib/certificate-scale";
import { CoreSubject } from "@/lib/mock-import-schema";
import { useTranslations } from "@/lib/i18n/locale-provider";

type TeacherRow = UserType & { classCount: number; avgScore: number | null };

// Список учителей филиала. Как и на странице групп, фильтр по филиалу делает
// не запрос, а политика users_branch_admin_read (миграция 072): учителя чужих
// филиалов просто не приходят.
export default function BranchTeachersPage() {
    const t = useTranslations("branchTeachers");
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
    const toast = useToast();
    const [teachers, setTeachers] = useState<TeacherRow[]>([]);
    const [loading, setLoading] = useState(true);
    // §11: назначение учителей — работа админа филиала, а не супер-админа.
    const [query, setQuery] = useState("");
    const [found, setFound] = useState<BranchTeacherCandidate[]>([]);
    const [searched, setSearched] = useState(false);
    const [searching, setSearching] = useState(false);
    const [promoting, setPromoting] = useState<string | null>(null);
    // Группы учителей. Берутся тем же загрузчиком, что и раздел групп: политика
    // classes_branch_admin_read (миграция 072) отдаёт только свой филиал,
    // поэтому фильтровать здесь нечего и незачем.
    const [classes, setClasses] = useState<AdminClassSummary[]>([]);
    // Раскрыт ровно один учитель: разом развёрнутые списки у десяти учителей
    // превращают страницу в простыню, а сравнивать их построчно всё равно
    // неудобно.
    const [openTeacherId, setOpenTeacherId] = useState<string | null>(null);

    const load = async () => {
            setLoading(true);
            const [{ data }, classRows] = await Promise.all([
                supabase.from("users").select("*").eq("role", "teacher"),
                fetchAdminClassesOverview().catch(() => [] as AdminClassSummary[]),
            ]);
            const rows = (data || []) as TeacherRow[];
            if (rows.length > 0) {
                const overview = await fetchAdminTeachersOverview().catch(() => new Map());
                rows.forEach((row) => {
                    const stats = overview.get(row.id);
                    row.classCount = stats?.classCount ?? 0;
                    row.avgScore = stats?.avgScore ?? null;
                });
            }
            setTeachers(rows);
            setClasses(classRows);
            setLoading(false);
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runSearch = async () => {
        if (query.trim().length < 2) return;
        setSearching(true);
        try {
            setFound(await searchBranchTeacherCandidates(query));
            setSearched(true);
        } catch (error) {
            toast.error(t("searchFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setSearching(false);
        }
    };

    // Одна кнопка на три случая — ученик, свободный учитель и учитель чужого
    // филиала, — потому что человек вводит ID и не обязан заранее знать, кем
    // тот оказался. Что именно произойдёт, написано и на кнопке, и в
    // подтверждении.
    const addToBranch = async (person: BranchTeacherCandidate) => {
        const fullName = `${person.name} ${person.surname}`.trim();
        const confirmText = person.role === "student"
            ? t("confirmPromote").replace("{name}", fullName)
            : person.branchName
                ? t("confirmTransfer").replace("{name}", fullName).replace("{branch}", person.branchName)
                : t("confirmAddTeacher").replace("{name}", fullName);
        if (!confirm(confirmText)) return;

        setPromoting(person.id);
        try {
            // Филиал ни в одном случае не передаём: RPC сама подставит филиал
            // вызывающего — админ филиала может назначать только в свой.
            if (person.role === "student") {
                await promoteStudentToTeacherInBranch(person.id, null);
                toast.success(t("promotedToast").replace("{name}", fullName));
            } else {
                await assignTeacherToBranch(person.id);
                toast.success(t("addedToast").replace("{name}", fullName));
            }
            setFound((current) => current.filter((s) => s.id !== person.id));
            await load();
        } catch (error) {
            toast.error(t("promoteFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setPromoting(null);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("subtitle")}</p>
            </section>

            {/* Назначение учителя. Ученик получает филиал этого админа, а его
                будущие группы наследуют филиал триггером — так их результаты
                попадают в средний балл именно этого филиала (§11). */}
            <section className="rounded-2xl border border-border bg-card p-5">
                <h2 className="text-sm font-bold text-foreground">{t("promoteTitle")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t("promoteHint")}</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <input
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setSearched(false); }}
                        onKeyDown={(e) => e.key === "Enter" && runSearch()}
                        placeholder={t("searchPlaceholder")}
                        className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/25"
                    />
                    <button
                        onClick={runSearch}
                        disabled={searching || query.trim().length < 2}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                    >
                        {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} {t("searchAction")}
                    </button>
                </div>
                {searched && found.length === 0 && (
                    <p className="mt-3 text-sm text-muted-foreground">{t("nobodyFound")}</p>
                )}
                {found.length > 0 && (
                    <div className="mt-3 space-y-2">
                        {found.map((person) => (
                            <div key={person.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">{person.name} {person.surname}</p>
                                    <p className="font-mono text-xs text-muted-foreground">{person.shortId}</p>
                                    {/* Кто это и где он сейчас — без этого «Перевести»
                                        появлялось бы без объяснения, откуда. */}
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {person.role === "student"
                                            ? t("roleStudent")
                                            : person.inMyBranch
                                                ? t("alreadyInYourBranch")
                                                : person.branchName
                                                    ? t("teacherOfBranch").replace("{branch}", person.branchName)
                                                    : t("teacherWithoutBranch")}
                                    </p>
                                </div>
                                {person.inMyBranch ? (
                                    <span className="shrink-0 rounded-lg bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
                                        {t("alreadyHere")}
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => addToBranch(person)}
                                        disabled={promoting === person.id}
                                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50"
                                    >
                                        <UserPlus size={13} />
                                        {promoting === person.id
                                            ? t("promoting")
                                            : person.role === "student"
                                                ? t("promoteAction")
                                                : person.branchName
                                                    ? t("transferAction")
                                                    : t("addTeacherAction")}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2].map((n) => <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />)}
                    </div>
                ) : teachers.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <GraduationCap size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("noTeachersYet")}</p>
                        <p className="mt-1 max-w-md mx-auto text-sm text-muted-foreground/70">{t("noTeachersHint")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {teachers.map((teacher) => {
                        const own = classes.filter((c) => c.teacherId === teacher.id);
                        const expanded = openTeacherId === teacher.id;
                        return (
                            <div key={teacher.id} className="rounded-2xl border border-border bg-card">
                              <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
                                <div className="flex min-w-0 items-center gap-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))]/10 font-bold text-[hsl(var(--brand-blue-ink))]">
                                        {teacher.name?.[0]?.toUpperCase() || "?"}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{teacher.name} {teacher.surname || ""}</p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            {teacher.email && <span className="flex items-center gap-1"><Mail size={12} />{teacher.email}</span>}
                                            {teacher.phone && <span className="flex items-center gap-1"><Phone size={12} />{teacher.phone}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
                                    {/* Число групп стало кнопкой: по нему и раскрывается,
                                        какие именно это группы. Отдельная ссылка «показать»
                                        рядом с тем же числом была бы лишней. */}
                                    <button
                                        onClick={() => setOpenTeacherId(expanded ? null : teacher.id)}
                                        disabled={own.length === 0}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors enabled:hover:bg-muted/60 disabled:opacity-60"
                                    >
                                        <Users size={13} /> {t("classesCount").replace("{count}", String(teacher.classCount))}
                                        {own.length > 0 && (
                                            <ChevronDown size={13} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                                        )}
                                    </button>
                                    {teacher.avgScore !== null && (
                                        // Цвет — от ПРОЦЕНТА: accuracyColor сравнивает с
                                        // порогами 80 и 50, а балл приходит по шкале 75.
                                        <span className={`rounded-xl px-3 py-2 text-xs font-extrabold tabular-nums ${accuracyColor(certificatePercent(teacher.avgScore, CERTIFICATE_MAX))}`}>
                                            {formatScore(teacher.avgScore)}
                                        </span>
                                    )}
                                </div>
                              </div>

                              {/* Группы этого учителя. Каждая ведёт на тот же экран
                                  группы, что и раздел «Группы», — с составом,
                                  результатами по каждому моку и разбором по вопросам.
                                  Доступ даёт RLS (миграции 072 и 106), отдельного
                                  режима для филиала не нужно. */}
                              {expanded && own.length > 0 && (
                                <ul className="space-y-2 border-t border-border px-5 py-4">
                                    {own.map((c) => (
                                        <li key={c.id}>
                                            <Link
                                                href={`/branch/classes/${c.id}`}
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
