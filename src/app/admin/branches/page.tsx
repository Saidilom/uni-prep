"use client";

import { useEffect, useState } from "react";
import { Building2, Plus, Users, GraduationCap, Pencil, Check, X } from "lucide-react";
import { fetchBranchOverview, createBranch, renameBranch, BranchOverview } from "@/lib/class-utils";
import { accuracyColor } from "@/lib/status-colors";
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

    const load = async () => {
        setLoading(true);
        try {
            setBranches(await fetchBranchOverview());
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

    const handleCreate = async () => {
        if (newName.trim().length < 1) return;
        setSaving(true);
        try {
            await createBranch(newName.trim());
            setNewName("");
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
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                    <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                        placeholder={t("branchNamePlaceholder")}
                        className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />
                    <button
                        onClick={handleCreate}
                        disabled={saving || newName.trim().length < 1}
                        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                        {saving ? t("saving") : t("create")}
                    </button>
                    <button
                        onClick={() => { setCreating(false); setNewName(""); }}
                        className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted"
                        aria-label={t("cancel")}
                    >
                        <X size={16} />
                    </button>
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
                                                <p className="truncate font-semibold text-foreground">{branch.branchName}</p>
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
                                <div className="flex shrink-0 flex-col items-end gap-1 self-start sm:self-auto">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("avgScoreLabel")}</span>
                                    {branch.avgAccuracy !== null ? (
                                        <span className={`rounded-xl px-4 py-2 text-sm font-extrabold tabular-nums ${accuracyColor(branch.avgAccuracy)}`}>
                                            {branch.avgAccuracy}%
                                        </span>
                                    ) : (
                                        <span className="rounded-xl border border-border bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground">
                                            {t("noResultsYet")}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
