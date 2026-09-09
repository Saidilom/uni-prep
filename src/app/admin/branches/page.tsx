"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Plus, Users, GraduationCap, Pencil, Check, X, ChevronRight, UserCheck } from "lucide-react";
import { fetchBranchOverview, createBranch, renameBranch, fetchReviewerCandidates, findUserByIdentifier, BranchOverview, ReviewerCandidate, BranchAdminCandidate } from "@/lib/class-utils";
import { accuracyColor } from "@/lib/status-colors";
import { formatScore, certificatePercent, CERTIFICATE_MAX } from "@/lib/certificate-scale";
import { useToast } from "@/hooks/useToast";
import { useTranslations } from "@/lib/i18n/locale-provider";

// §5: филиалы у супер-админа. Средний балл филиала — среднее из средних баллов
// его групп (не среднее по всем попыткам): так задал владелец, и так считает
// get_branch_overview в миграции 072.
//
// Состав филиала набирается сам: админ филиала назначает учителей, учитель
// создаёт группы, группа наследует филиал учителя триггером. Здесь только
// список, цифры и переименование.
export default function AdminBranchesPage() {
    const t = useTranslations("adminBranches");
    const toast = useToast();
    const [branches, setBranches] = useState<BranchOverview[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    // §10: филиал создаётся сразу с админом. Раньше это были два разных шага, и
    // про второй забывали — на проде уже есть админ филиала без филиала.
    const [candidates, setCandidates] = useState<ReviewerCandidate[]>([]);
    const [newAdminId, setNewAdminId] = useState("");
    // Ввод админа по ID — основной путь. Выпадающий список отдаёт только
    // учителей и админов, а админом нового филиала чаще ставят обычного
    // зарегистрированного человека, которого в том списке нет вовсе.
    const [adminIdInput, setAdminIdInput] = useState("");
    const [lookedUp, setLookedUp] = useState<BranchAdminCandidate | null>(null);
    const [lookupState, setLookupState] = useState<"idle" | "searching" | "notFound">("idle");

    const load = async () => {
        setLoading(true);
        try {
            const [overview, people] = await Promise.all([
                fetchBranchOverview(),
                fetchReviewerCandidates().catch(() => [] as ReviewerCandidate[]),
            ]);
            setBranches(overview);
            setCandidates(people);
        } catch (error) {
            toast.error(t("loadFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Кого именно назначаем — показываем ДО создания. Иначе супер-админ
    // вставляет ID и узнаёт, кому отдал филиал, только постфактум, а роль к
    // этому моменту уже сменена.
    useEffect(() => {
        const id = adminIdInput.trim();
        if (!id) { setLookedUp(null); setLookupState("idle"); return; }
        let active = true;
        setLookupState("searching");
        const timer = setTimeout(async () => {
            try {
                const found = await findUserByIdentifier(id);
                if (!active) return;
                setLookedUp(found);
                setLookupState(found ? "idle" : "notFound");
            } catch {
                if (!active) return;
                setLookedUp(null);
                setLookupState("notFound");
            }
        }, 300);
        return () => { active = false; clearTimeout(timer); };
    }, [adminIdInput]);

    // ID главнее выбора из списка: если введён — назначаем его.
    const effectiveAdminId = adminIdInput.trim() ? (lookedUp?.id ?? null) : (newAdminId || null);
    // Введён ID, но за ним никого нет — создавать нельзя: филиал остался бы
    // без админа, а супер-админ думал бы, что назначил.
    const adminIdBroken = adminIdInput.trim().length > 0 && !lookedUp;

    const handleCreate = async () => {
        if (newName.trim().length < 1) return;
        setSaving(true);
        try {
            await createBranch(newName.trim(), effectiveAdminId);
            setNewName("");
            setNewAdminId("");
            setAdminIdInput("");
            setLookedUp(null);
            setCreating(false);
            toast.success(t("branchCreatedToast"));
            await load();
        } catch (error) {
            toast.error(t("branchCreateFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setSaving(false);
        }
    };

    const handleRename = async (branchId: string) => {
        if (editName.trim().length < 1) return;
        setSaving(true);
        try {
            await renameBranch(branchId, editName.trim());
            setEditingId(null);
            toast.success(t("branchRenamedToast"));
            await load();
        } catch (error) {
            toast.error(t("branchRenameFailed"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{t("subtitle")}</p>
                </div>
                {!creating && (
                    <button
                        onClick={() => setCreating(true)}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[hsl(var(--brand-blue-ink))] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
                    >
                        <Plus size={16} /> {t("createBranch")}
                    </button>
                )}
            </section>

            {creating && (
                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
                    <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !adminIdBroken && handleCreate()}
                        placeholder={t("branchNamePlaceholder")}
                        className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />

                    {/* Админ филиала. Основной путь — ID: филиал без админа
                        никто не ведёт, а в списке ниже только учителя и
                        админы, обычного человека там нет. */}
                    <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            {t("branchAdminIdLabel")}
                        </label>
                        <input
                            value={adminIdInput}
                            onChange={(e) => setAdminIdInput(e.target.value)}
                            placeholder={t("branchAdminIdPlaceholder")}
                            spellCheck={false}
                            className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                        />
                        {/* Кого назначаем — видно ДО создания, а не после. */}
                        {lookupState === "searching" && (
                            <p className="mt-1.5 text-xs text-muted-foreground">{t("branchAdminSearching")}</p>
                        )}
                        {lookupState === "notFound" && (
                            <p className="mt-1.5 text-xs font-semibold text-red-600">{t("branchAdminNotFound")}</p>
                        )}
                        {lookedUp && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                                    <UserCheck size={12} /> {lookedUp.name}
                                </span>
                                {/* Короткий ID рядом с именем: по нему супер-админ
                                    и сверяет, того ли нашли. */}
                                {lookedUp.shortId && (
                                    <span className="rounded-lg bg-muted px-2 py-1 font-mono font-semibold text-muted-foreground">
                                        {lookedUp.shortId}
                                    </span>
                                )}
                                <span className="rounded-lg bg-muted px-2 py-1 font-semibold text-muted-foreground">
                                    {lookedUp.role}
                                </span>
                                {/* Человек уже где-то состоит — его ПЕРЕВЕДУТ,
                                    и сказать об этом надо заранее. */}
                                {lookedUp.branchId && (
                                    <span className="rounded-lg bg-amber-50 px-2 py-1 font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                                        {t("branchAdminAlreadyInBranch")}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Запасной путь — выбрать из учителей и админов. Гаснет,
                        когда введён ID: два источника одного значения сбивают
                        с толку, а спорить о том, кто главнее, не о чем. */}
                    {!adminIdInput.trim() && (
                        <select
                            value={newAdminId}
                            onChange={(e) => setNewAdminId(e.target.value)}
                            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground"
                        >
                            <option value="">{t("branchAdminNone")}</option>
                            {candidates.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    )}

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCreate}
                            disabled={saving || newName.trim().length < 1 || adminIdBroken}
                            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                        >
                            {saving ? t("saving") : t("create")}
                        </button>
                        <button
                            onClick={() => { setCreating(false); setNewName(""); setAdminIdInput(""); setLookedUp(null); }}
                            className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted"
                            aria-label={t("cancel")}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2].map((n) => <div key={n} className="h-20 animate-pulse rounded-2xl border border-border bg-muted" />)}
                    </div>
                ) : branches.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <Building2 size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("noBranchesYet")}</p>
                        <p className="mt-1 max-w-md mx-auto text-sm text-muted-foreground/70">{t("noBranchesHint")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {branches.map((branch) => (
                            <div key={branch.branchId} className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
                                <div className="flex min-w-0 items-center gap-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand-olive-soft))] text-[hsl(var(--brand-olive-ink))]">
                                        <Building2 size={18} />
                                    </span>
                                    <div className="min-w-0">
                                        {editingId === branch.branchId ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    autoFocus
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    onKeyDown={(e) => e.key === "Enter" && handleRename(branch.branchId)}
                                                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                                                />
                                                <button onClick={() => handleRename(branch.branchId)} disabled={saving} className="rounded-lg p-1.5 text-emerald-700 hover:bg-muted disabled:opacity-50"><Check size={15} /></button>
                                                <button onClick={() => setEditingId(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X size={15} /></button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                {/* Ссылкой сделано имя, а не вся карточка: внутри
                                                    живут кнопка переименования и поле ввода, и
                                                    клик по ним уводил бы со страницы. */}
                                                <Link
                                                    href={`/admin/branches/${branch.branchId}`}
                                                    className="truncate font-semibold text-foreground hover:underline"
                                                >
                                                    {branch.branchName}
                                                </Link>
                                                <button
                                                    onClick={() => { setEditingId(branch.branchId); setEditName(branch.branchName); }}
                                                    className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
                                                    aria-label={t("rename")}
                                                >
                                                    <Pencil size={13} />
                                                </button>
                                            </div>
                                        )}
                                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1"><GraduationCap size={12} /> {t("classesCount").replace("{count}", String(branch.classCount))}</span>
                                            <span className="flex items-center gap-1"><Users size={12} /> {t("teachersCount").replace("{count}", String(branch.teacherCount))}</span>
                                            <span className="flex items-center gap-1"><Users size={12} /> {t("studentsCount").replace("{count}", String(branch.studentCount))}</span>
                                        </div>
                                    </div>
                                </div>
                                {/* §12: рядом со средним баллом — балл по месячному
                                    тесту, по последнему опубликованному комплекту. */}
                                <div className="flex shrink-0 items-start gap-4 self-start sm:self-auto">
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("avgScoreLabel")}</span>
                                        {branch.avgScore !== null ? (
                                            <span className={`rounded-xl px-4 py-2 text-sm font-extrabold tabular-nums ${accuracyColor(certificatePercent(branch.avgScore, CERTIFICATE_MAX))}`}>
                                                {formatScore(branch.avgScore)}
                                            </span>
                                        ) : (
                                            <span className="rounded-xl border border-border bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground">
                                                {t("noResultsYet")}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("avgOylikLabel")}</span>
                                        {branch.avgOylik !== null ? (
                                            <span className={`rounded-xl px-4 py-2 text-sm font-extrabold tabular-nums ${accuracyColor(certificatePercent(branch.avgOylik, CERTIFICATE_MAX))}`}>
                                                {formatScore(branch.avgOylik)}
                                            </span>
                                        ) : (
                                            <span className="rounded-xl border border-border bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground">
                                                {t("noOylikYet")}
                                            </span>
                                        )}
                                    </div>
                                    <Link
                                        href={`/admin/branches/${branch.branchId}`}
                                        className="flex h-9 w-9 items-center justify-center self-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                                        aria-label={t("openBranch")}
                                    >
                                        <ChevronRight size={16} />
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
