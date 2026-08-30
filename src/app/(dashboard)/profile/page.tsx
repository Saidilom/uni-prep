"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useAuthStore } from "@/store/useAuthStore";
import { Class } from "@/lib/firestore-schema";
import { fetchStudentClasses } from "@/lib/profile-utils";
import { updateUserProfile } from "@/lib/auth-utils";
import { APP_NAME } from "@/lib/app-config";
import { ShieldCheck, Copy, Check, Settings2, X, Mail, Calendar, GraduationCap } from "lucide-react";
import HeroBanner from "@/components/hero-banner";
import { pluralizeRu } from "@/lib/pluralize-ru";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

export default function ProfilePage() {
    const { user, setUser } = useAuthStore();
    const { locale } = useLocale();
    const t = useTranslations("profile");

    const [classes, setClasses] = useState<Class[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newSurname, setNewSurname] = useState("");
    const [isUpdating, setIsUpdating] = useState(false);
    const [qrDataUrl, setQrDataUrl] = useState("");

    const studentId = user?.shortId || user?.id || "";

    useEffect(() => {
        if (!user?.id) return;
        setNewName(user.name);
        setNewSurname(user.surname || "");

        const load = async () => {
            const classesData = user.role === "student" ? await fetchStudentClasses(user.id) : [];
            setClasses(classesData);
            setIsLoading(false);
        };

        load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    useEffect(() => {
        if (!studentId) return;
        QRCode.toDataURL(studentId, { width: 200, margin: 1, color: { dark: "#1e3a8a", light: "#ffffff" } }).then(setQrDataUrl);
    }, [studentId]);

    const copyId = () => {
        if (!studentId) return;
        navigator.clipboard.writeText(studentId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || newName.length < 2) return;
        try {
            setIsUpdating(true);
            const updatedUser = await updateUserProfile(user.id, { name: newName, surname: newSurname });
            setUser(updatedUser);
            setIsEditModalOpen(false);
        } catch {
            alert(t("updateError"));
        } finally {
            setIsUpdating(false);
        }
    };

    if (!user) return null;

    const statusLabel =
        user.role === "admin" ? t("roleAdmin")
        : user.role === "teacher" ? t("roleTeacher")
        : user.isRegistanStudent ? t("roleRegistanStudent")
        : t("roleStudent");

    const infoTiles = [
        { icon: Mail, label: t("emailLabel"), value: user.email },
        { icon: Calendar, label: t("memberSinceLabel"), value: new Date(user.createdAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ", { day: "numeric", month: "long", year: "numeric" }) },
        { icon: GraduationCap, label: t("statusLabel"), value: statusLabel },
    ];

    return (
        <div className="flex flex-col gap-8 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t("subtitle")}
                </p>
            </section>

            <div className="grid gap-6 lg:grid-cols-[minmax(280px,340px)_1fr] lg:items-start">
                <aside className="flex flex-col gap-6">
                    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <div className="flex flex-col items-center gap-4 text-center">
                            <div className="relative h-24 w-24 flex-shrink-0 cursor-pointer group" onClick={() => setIsEditModalOpen(true)}>
                                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted text-4xl font-bold text-foreground shadow-sm">
                                    {user.name[0].toUpperCase()}
                                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/10 opacity-0 transition-opacity group-hover:opacity-100">
                                        <Settings2 size={24} className="text-white" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-center gap-2">
                                <h2 className="text-xl font-bold tracking-tight text-foreground leading-tight">
                                    {user.name} {user.surname || ""}
                                </h2>
                                <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                    <ShieldCheck size={11} />
                                    {user.role === "admin" ? t("roleAdmin") : user.role === "teacher" ? t("roleTeacher") : t("roleBadgeStudent")}
                                </span>
                            </div>

                            <button onClick={() => setIsEditModalOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted active:scale-[0.98]">
                                <Settings2 size={14} />
                                {t("editProfileButton")}
                            </button>
                        </div>
                    </div>

                    <HeroBanner className="bg-none bg-[hsl(var(--brand-blue-ink))] p-6 shadow-xl shadow-[hsl(var(--brand-blue-ink))]/20">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-widest text-white/70">{APP_NAME}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                                {user.role === "teacher" ? t("teacherIdLabel") : t("studentIdLabel")}
                            </span>
                        </div>
                        <div className="mt-5 flex items-end justify-between gap-4">
                            <button onClick={copyId} className="flex items-center gap-2 font-mono text-2xl font-extrabold tracking-wider text-white">
                                {studentId}
                                {copied ? <Check size={18} className="text-emerald-300" /> : <Copy size={18} className="text-white/70" />}
                            </button>
                            {qrDataUrl ? (
                                <div className="shrink-0 rounded-xl bg-white p-1.5 shadow-sm">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={qrDataUrl} alt={t("qrAlt")} width={64} height={64} />
                                </div>
                            ) : null}
                        </div>
                    </HeroBanner>
                </aside>

                <main className="flex flex-col gap-8">
                    <section>
                        <h2 className="mb-5 text-xl font-bold tracking-tight text-[hsl(var(--brand-blue-ink))]">{t("accountSection")}</h2>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            {infoTiles.map(({ icon: Icon, label, value }) => (
                                <div key={label} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                                        <Icon size={17} />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
                                        <p className="mt-0.5 truncate font-semibold text-foreground">{value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {user.role === "student" && (
                        <section>
                            <div className="mb-5 flex items-center justify-between">
                                <h2 className="text-xl font-bold tracking-tight text-[hsl(var(--brand-blue-ink))]">{t("myGroupsSection")}</h2>
                                <span className="text-sm text-muted-foreground">{classes.length} {locale === "ru" ? pluralizeRu(classes.length, ["группа", "группы", "групп"]) : t("groupWord")}</span>
                            </div>
                            {isLoading ? (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {[1, 2].map(n => <div key={n} className="h-24 animate-pulse rounded-2xl border border-border bg-muted" />)}
                                </div>
                            ) : classes.length > 0 ? (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {classes.map((cls) => (
                                        <div key={cls.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                                <GraduationCap size={18} />
                                            </span>
                                            <h3 className="font-semibold text-foreground">{cls.name}</h3>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-border bg-muted/50 p-12 text-center font-medium text-muted-foreground">
                                    {t("notInAnyGroup")}
                                </div>
                            )}
                        </section>
                    )}
                </main>
            </div>

            {isEditModalOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-md bg-card border border-border rounded-3xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-8">
                                <h2 className="text-2xl font-bold text-foreground tracking-tight">{t("editProfileModalTitle")}</h2>
                                <button onClick={() => setIsEditModalOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors"><X size={24} /></button>
                            </div>
                            <form onSubmit={handleUpdateProfile} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">{t("nameLabel")}</label>
                                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full p-4 bg-muted/50 border border-border rounded-2xl focus:border-ring focus:ring-1 focus:ring-ring/25 focus:outline-none transition-colors font-medium text-foreground placeholder:text-muted-foreground/70" placeholder={t("namePlaceholder")} required />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">{t("surnameLabel")}</label>
                                    <input type="text" value={newSurname} onChange={(e) => setNewSurname(e.target.value)} className="w-full p-4 bg-muted/50 border border-border rounded-2xl focus:border-ring focus:ring-1 focus:ring-ring/25 focus:outline-none transition-colors font-medium text-foreground placeholder:text-muted-foreground/70" placeholder={t("surnamePlaceholder")} />
                                </div>
                                <div className="flex gap-4 pt-4">
                                    <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 py-4 border border-border text-muted-foreground rounded-xl font-bold hover:bg-muted/50 transition-all">{t("cancel")}</button>
                                    <button type="submit" disabled={isUpdating || newName.length < 2} className="flex-1 py-4 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50">
                                        {isUpdating ? t("saving") : t("save")}
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
