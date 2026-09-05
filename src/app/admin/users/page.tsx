"use client";

import { useEffect, useState } from "react";
import { Phone, Mail, Calendar, UserCheck, IdCard } from "lucide-react";
import { User as UserType } from "@/lib/firestore-schema";
import supabase from "@/lib/supabase/client";
import { fetchBranches, setUserRole, Branch } from "@/lib/class-utils";
import { useToast } from "@/hooks/useToast";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

type AdminUser = UserType & { registeredVia?: string; shortid?: string; branch_id?: string | null };
type AssignableRole = "student" | "teacher" | "staff" | "branch_admin" | "admin";
type RoleFilter = "all" | AssignableRole;
const ROLE_FILTERS: RoleFilter[] = ["all", "student", "teacher", "staff", "branch_admin", "admin"];
const ROLE_FILTER_LABEL_KEYS: Partial<Record<RoleFilter, "roleStudent" | "roleTeacher" | "roleStaff" | "roleBranchAdmin" | "roleAdmin">> = {
    student: "roleStudent",
    teacher: "roleTeacher",
    staff: "roleStaff",
    branch_admin: "roleBranchAdmin",
    admin: "roleAdmin",
};

const studentId = (u: AdminUser) => u.shortId || u.shortid || "";

// Locked in the DB too (protect_user_privileged_fields_trg /
// protect_super_admin_delete_trg, migration 025) — this is just so an admin
// doesn't get a confusing silent no-op from clicking a dropdown that can't
// actually change anything.
const PERMANENT_SUPER_ADMIN_ID = "ed845170-28aa-4d33-b0a1-40a9e8d8af01";

export default function AdminUsersPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const { locale } = useLocale();
    const t = useTranslations("adminUsers");
    const toast = useToast();

    const load = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("users")
            .select("*")
            .order("createdAt", { ascending: false });
        if (!error && data) setUsers(data as AdminUser[]);
        setBranches(await fetchBranches());
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    // Все три действия ниже раньше выбрасывали error молча: список
    // перерисовывался старым значением, и отличить отказ от успеха было
    // невозможно — ни пользователю, ни при разборе жалобы.
    const toggleRegistan = async (u: AdminUser) => {
        const { error } = await supabase.from("users").update({ isRegistanStudent: !u.isRegistanStudent }).eq("id", u.id);
        if (error) {
            toast.error(t("registanSaveFailed"), { description: error.message });
            return;
        }
        load();
    };

    const setRole = async (u: AdminUser, role: AssignableRole) => {
        if (role === u.role) return;
        const fullName = `${u.name} ${u.surname || ""}`.trim();
        if (role === "admin" && !confirm(t("confirmMakeAdmin").replace("{name}", fullName))) return;
        if (role === "staff" && !confirm(t("confirmMakeStaff").replace("{name}", fullName))) return;
        try {
            // Через RPC, а не прямым UPDATE: у последнего отказ выглядел как
            // успех (см. setUserRole и миграцию 079).
            await setUserRole(u.id, role);
            toast.success(t("roleSavedToast").replace("{name}", fullName));
            load();
        } catch (error) {
            toast.error(t("roleSaveFailed"), { description: error instanceof Error ? error.message : String(error) });
        }
    };

    // Филиал живёт отдельно от роли: он нужен и админу филиала (что он видит),
    // и учителю (какой филиал унаследуют его группы).
    const setBranch = async (u: AdminUser, branchId: string) => {
        const { error } = await supabase.from("users").update({ branch_id: branchId || null }).eq("id", u.id);
        if (error) {
            toast.error(t("branchSaveFailed"), { description: error.message });
            return;
        }
        load();
    };

    const roleCount = (role: RoleFilter) => (role === "all" ? users.length : users.filter((u) => u.role === role).length);

    const filtered = users.filter((u) => {
        if (roleFilter !== "all" && u.role !== roleFilter) return false;
        return (u.name + " " + (u.surname || "") + " " + (u.email || "") + " " + (u.phone || "") + " " + studentId(u))
            .toLowerCase()
            .includes(search.toLowerCase());
    });

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t("subtitle")}
                </p>
                <div className="mt-6">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t("searchPlaceholder")}
                        className="w-full rounded-2xl border border-border bg-background py-3 pl-4 pr-4 text-foreground placeholder:text-muted-foreground transition-colors focus:border-border focus:outline-none focus:ring-2 focus:ring-ring/25"
                    />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {ROLE_FILTERS.map((role) => (
                        <button
                            key={role}
                            onClick={() => setRoleFilter(role)}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                                roleFilter === role
                                    ? "border-foreground bg-foreground text-background"
                                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {ROLE_FILTER_LABEL_KEYS[role] ? t(ROLE_FILTER_LABEL_KEYS[role]) : t("roleFilterAll")}
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${roleFilter === role ? "bg-background/20" : "bg-muted"}`}>
                                {roleCount(role)}
                            </span>
                        </button>
                    ))}
                </div>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((n) => (
                            <div key={n} className="h-16 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">{t("noUsersYet")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((u) => (
                            <div
                                key={u.id}
                                className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:bg-muted/40 sm:flex-row sm:items-center"
                            >
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted font-bold text-foreground shadow-sm">
                                        {u.name?.[0]?.toUpperCase() || "?"}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">
                                            {u.name} {u.surname || ""}
                                        </p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            {studentId(u) && <span className="flex items-center gap-1 font-mono font-semibold"><IdCard size={12} />{studentId(u)}</span>}
                                            {u.email && <span className="flex items-center gap-1"><Mail size={12} />{u.email}</span>}
                                            {u.phone && <span className="flex items-center gap-1"><Phone size={12} />{u.phone}</span>}
                                            <span className="flex items-center gap-1"><Calendar size={12} />{new Date(u.createdAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ")}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-2">
                                    <button
                                        onClick={() => toggleRegistan(u)}
                                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${u.isRegistanStudent ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                                    >
                                        <UserCheck size={14} />
                                        {u.isRegistanStudent ? t("registanBadge") : t("regularBadge")}
                                    </button>
                                    {u.id === PERMANENT_SUPER_ADMIN_ID ? (
                                        <span
                                            title={t("permanentSuperAdminTitle")}
                                            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 dark:bg-amber-950/40"
                                        >
                                            {t("mainSuperAdmin")}
                                        </span>
                                    ) : (
                                        <select
                                            value={u.role}
                                            onChange={(e) => setRole(u, e.target.value as AssignableRole)}
                                            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                                                u.role === "admin"
                                                    ? "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/40"
                                                    : u.role === "staff"
                                                    ? "border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/40"
                                                    : u.role === "branch_admin"
                                                    ? "border-teal-200 bg-teal-50 text-teal-700 dark:bg-teal-950/40"
                                                    : u.role === "teacher"
                                                    ? "border-violet-200 bg-violet-50 text-violet-700 dark:bg-violet-950/40"
                                                    : "border-border bg-card text-muted-foreground"
                                            }`}
                                        >
                                            <option value="student">{t("roleStudent")}</option>
                                            <option value="teacher">{t("roleTeacher")}</option>
                                            <option value="staff">{t("roleStaff")}</option>
                                            <option value="branch_admin">{t("roleBranchAdmin")}</option>
                                            <option value="admin">{t("roleAdmin")}</option>
                                        </select>
                                    )}
                                    {/* Филиал показываем только тем, кому он что-то
                                        значит: администратору филиала — что он видит,
                                        учителю — какой филиал унаследуют его группы. */}
                                    {(u.role === "branch_admin" || u.role === "teacher") && branches.length > 0 && (
                                        <select
                                            value={u.branch_id || ""}
                                            onChange={(e) => setBranch(u, e.target.value)}
                                            className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground"
                                        >
                                            <option value="">{t("noBranchOption")}</option>
                                            {branches.map((branch) => (
                                                <option key={branch.id} value={branch.id}>{branch.name}</option>
                                            ))}
                                        </select>
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
