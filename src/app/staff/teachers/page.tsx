"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Phone, GraduationCap, ArrowUpDown } from "lucide-react";
import { fetchAllTeachersForStaff } from "@/lib/staff-utils";
import { User } from "@/lib/firestore-schema";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

type SortKey = "name" | "date";
type SortDir = "asc" | "desc";

export default function StaffTeachersPage() {
    const { locale } = useLocale();
    const t = useTranslations("staffTeachers");
    const [teachers, setTeachers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("date");
    const [sortDir, setSortDir] = useState<SortDir>("desc");

    useEffect(() => {
        (async () => {
            setLoading(true);
            setTeachers(await fetchAllTeachersForStaff());
            setLoading(false);
        })();
    }, []);

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((current) => (current === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("asc");
        }
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = q
            ? teachers.filter((teacher) => (`${teacher.name} ${teacher.surname || ""} ${teacher.phone || ""}`).toLowerCase().includes(q))
            : [...teachers];
        list.sort((a, b) => {
            const dir = sortDir === "asc" ? 1 : -1;
            if (sortKey === "name") {
                return dir * `${a.name} ${a.surname || ""}`.localeCompare(`${b.name} ${b.surname || ""}`);
            }
            return dir * (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
        });
        return list;
    }, [teachers, search, sortKey, sortDir]);

    const sortButtonClass = (key: SortKey) =>
        `inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
            sortKey === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
        }`;

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t("subtitle")}
                </p>
            </section>

            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 min-w-[200px]">
                    <Search size={16} className="shrink-0 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t("searchPlaceholder")}
                        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><ArrowUpDown size={13} /> {t("sortByLabel")}</span>
                    <button onClick={() => toggleSort("name")} className={sortButtonClass("name")}>
                        {t("sortByName")} {sortKey === "name" && (sortDir === "asc" ? "↑" : "↓")}
                    </button>
                    <button onClick={() => toggleSort("date")} className={sortButtonClass("date")}>
                        {t("sortByDate")} {sortKey === "date" && (sortDir === "asc" ? "↑" : "↓")}
                    </button>
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
                        <GraduationCap size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{teachers.length === 0 ? t("noTeachersYet") : t("noResultsFound")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((teacher) => (
                            <div key={teacher.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))]/10 font-bold text-[hsl(var(--brand-blue-ink))]">
                                        {teacher.name?.[0]?.toUpperCase() || "?"}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{teacher.name} {teacher.surname || ""}</p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            <span className="font-mono">{teacher.shortId}</span>
                                            {teacher.phone && <span className="flex items-center gap-1"><Phone size={12} />{teacher.phone}</span>}
                                        </div>
                                    </div>
                                </div>
                                {teacher.createdAt && (
                                    <span className="shrink-0 self-start rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground sm:self-auto">
                                        {new Date(teacher.createdAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ")}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
