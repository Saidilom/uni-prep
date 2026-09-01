"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap, User as UserIcon, ChevronRight, Users } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { fetchStudentClasses, StudentClassSummary } from "@/lib/class-utils";
import { useTranslations } from "@/lib/i18n/locale-provider";

export default function StudentClassesView() {
    const { user } = useAuthStore();
    const t = useTranslations("studentClasses");
    const [classes, setClasses] = useState<StudentClassSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        fetchStudentClasses(user.id).then((data) => {
            setClasses(data);
            setLoading(false);
        });
    }, [user]);

    if (!user) return null;

    return (
        <div className="flex flex-col gap-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">{t("subtitle")}</p>
            </section>

            <section>
                {loading ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map((n) => <div key={n} className="h-24 animate-pulse rounded-2xl border border-border bg-muted" />)}
                    </div>
                ) : classes.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <Users size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("noClassesYet")}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {classes.map((c) => (
                            <Link
                                key={c.id}
                                href={`/classes/${c.id}`}
                                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:bg-muted/40"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand-blue-ink))]/10 text-[hsl(var(--brand-blue-ink))]">
                                        <GraduationCap size={18} />
                                    </span>
                                    <ChevronRight size={16} className="mt-2.5 shrink-0 text-muted-foreground" />
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-foreground">{c.name}</p>
                                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <UserIcon size={12} /> {c.teacherName}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
