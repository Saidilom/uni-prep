"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Mail, Calendar, ShieldCheck, Building2, Settings2, X } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { updateUserProfile } from "@/lib/auth-utils";
import { fetchBranchOverview } from "@/lib/class-utils";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

// Профиль для супер-админа и админа филиала.
//
// У учеников и учителей профиль был всегда (/profile в разделе (dashboard)), а
// у этих двух ролей — нет: обе живут в своих разделах, и с дашборда их уводит
// редирект. Поэтому ни ID, ни почту посмотреть было негде, а ФИО поменять —
// тем более.
//
// Один компонент на обе панели: страницы /admin/profile и /branch/profile —
// тонкие обёртки над ним. Две копии рано или поздно разошлись бы.
//
// Ученический профиль не переиспользуется: он про QR-код, ID ученика и список
// групп — здесь всё это не нужно.
export default function AdminProfileView() {
    const { user, setUser } = useAuthStore();
    const { locale } = useLocale();
    const t = useTranslations("adminProfile");

    const [copied, setCopied] = useState(false);
    const [branchName, setBranchName] = useState<string | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newSurname, setNewSurname] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!user) return;
        setNewName(user.name ?? "");
        setNewSurname(user.surname ?? "");
    }, [user]);

    // Филиал показываем только его администратору: у супер-админа своего
    // филиала нет, и пустая плитка сбивала бы с толку. Название берём из
    // get_branch_overview — она и так отдаёт админу филиала ровно его один.
    useEffect(() => {
        if (user?.role !== "branch_admin") return;
        fetchBranchOverview()
            .then((rows) => setBranchName(rows[0]?.branchName ?? null))
            .catch(() => setBranchName(null));
    }, [user?.role]);

    if (!user) return null;

    const publicId = user.shortId || user.id;

    const copyId = () => {
        navigator.clipboard.writeText(publicId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newName.trim().length < 2) {
            setError(t("nameTooShort"));
            return;
        }
        setIsSaving(true);
        setError("");
        try {
            const updated = await updateUserProfile(user.id, { name: newName, surname: newSurname });
            setUser(updated);
            setIsEditOpen(false);
        } catch (err) {
            // Показываем причину, а не общее «не получилось»: у этой записи
            // есть защитный триггер, и молчаливый отказ читался бы как поломка.
            setError(err instanceof Error ? err.message : t("saveFailed"));
        } finally {
            setIsSaving(false);
        }
    };

    const roleLabel = user.role === "admin" ? t("roleAdmin") : t("roleBranchAdmin");
    const fullName = `${user.name ?? ""} ${user.surname ?? ""}`.trim() || t("noNameYet");

    const tiles = [
        { icon: Mail, label: t("emailLabel"), value: user.email || "—" },
        { icon: ShieldCheck, label: t("roleLabel"), value: roleLabel },
        ...(user.role === "branch_admin"
            ? [{ icon: Building2, label: t("branchLabel"), value: branchName ?? t("branchNotSet") }]
            : []),
        {
            icon: Calendar,
            label: t("memberSinceLabel"),
            value: user.createdAt
                ? new Date(user.createdAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ", { day: "numeric", month: "long", year: "numeric" })
                : "—",
        },
    ];

    return (
        <div className="flex flex-col gap-8">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">{t("subtitle")}</p>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="truncate text-2xl font-bold tracking-tight text-foreground">{fullName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{roleLabel}</p>
                    </div>
                    <button
                        onClick={() => { setError(""); setIsEditOpen(true); }}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-muted"
                    >
                        <Settings2 size={15} /> {t("editAction")}
                    </button>
                </div>

                {/* ID отдельным блоком с копированием: его диктуют вслух и
                    вставляют в другие разделы — например, чтобы админ филиала
                    добавил учителя. */}
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("idLabel")}</span>
                    <code className="font-mono text-sm font-semibold text-foreground">{publicId}</code>
                    <button
                        onClick={copyId}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? t("copied") : t("copyAction")}
                    </button>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {tiles.map((tile) => (
                    <div key={tile.label} className="rounded-2xl border border-border bg-card p-5">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                            <tile.icon size={18} />
                        </div>
                        <p className="text-xs text-muted-foreground">{tile.label}</p>
                        <p className="mt-1 truncate text-sm font-semibold text-foreground">{tile.value}</p>
                    </div>
                ))}
            </section>

            {isEditOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
                        <div className="p-8">
                            <div className="mb-8 flex items-center justify-between">
                                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("editTitle")}</h2>
                                <button onClick={() => setIsEditOpen(false)} className="text-muted-foreground transition-colors hover:text-foreground">
                                    <X size={24} />
                                </button>
                            </div>
                            <form onSubmit={save} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="ml-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("nameLabel")}</label>
                                    <input
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        placeholder={t("namePlaceholder")}
                                        required
                                        className="w-full rounded-2xl border border-border bg-muted/50 p-4 font-medium text-foreground transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/25"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="ml-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("surnameLabel")}</label>
                                    <input
                                        value={newSurname}
                                        onChange={(e) => setNewSurname(e.target.value)}
                                        placeholder={t("surnamePlaceholder")}
                                        className="w-full rounded-2xl border border-border bg-muted/50 p-4 font-medium text-foreground transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/25"
                                    />
                                </div>
                                {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
                                <div className="flex gap-4 pt-2">
                                    <button type="button" onClick={() => setIsEditOpen(false)} className="flex-1 rounded-xl border border-border py-4 font-bold text-muted-foreground transition-all hover:bg-muted/50">
                                        {t("cancel")}
                                    </button>
                                    <button type="submit" disabled={isSaving || newName.trim().length < 2} className="flex-1 rounded-xl bg-primary py-4 font-bold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50">
                                        {isSaving ? t("saving") : t("save")}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
