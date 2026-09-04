"use client";

import { useEffect, useState } from "react";
import { Trophy, Users, Building2, Globe } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { fetchMyRating, MyRating, RatingKind, RatingScope } from "@/lib/class-utils";
import { accuracyColor } from "@/lib/status-colors";
import { useTranslations } from "@/lib/i18n/locale-provider";

const SCOPES: Array<{ id: RatingScope; icon: typeof Users }> = [
    { id: "class", icon: Users },
    { id: "branch", icon: Building2 },
    { id: "platform", icon: Globe },
];

const KINDS: RatingKind[] = ["oylik", "overall"];

// §7: место ученика в двух рейтингах и трёх областях сравнения.
//
// Все шесть комбинаций считает база (get_my_rating, миграция 074) и отдаёт
// только собственное место — чужих результатов страница не получает вовсе.
// Место считается по доле от максимума, а не по сумме баллов: в филиале и на
// платформе ученики сдают разные тесты, и сырые баллы между ними несравнимы.
export default function RatingPage() {
    const { user } = useAuthStore();
    const t = useTranslations("rating");
    const [scope, setScope] = useState<RatingScope>("class");
    const [ratings, setRatings] = useState<Record<RatingKind, MyRating | null>>({ oylik: null, overall: null });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        (async () => {
            setLoading(true);
            const [oylik, overall] = await Promise.all([
                fetchMyRating("oylik", scope).catch(() => null),
                fetchMyRating("overall", scope).catch(() => null),
            ]);
            setRatings({ oylik, overall });
            setLoading(false);
        })();
    }, [user, scope]);

    if (!user) return null;

    return (
        <div className="flex flex-col gap-8 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">{t("subtitle")}</p>
            </section>

            <section className="flex flex-wrap gap-2">
                {SCOPES.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setScope(item.id)}
                        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                            scope === item.id ? "border-transparent bg-[hsl(var(--brand-blue-ink))] text-white" : "border-border hover:bg-muted"
                        }`}
                    >
                        <item.icon size={15} /> {t(`scope_${item.id}` as "scope_class" | "scope_branch" | "scope_platform")}
                    </button>
                ))}
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {KINDS.map((kind) => {
                    const rating = ratings[kind];
                    return (
                        <div key={kind} className="rounded-2xl border border-border bg-card p-6">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Trophy size={15} />
                                <span className="text-[10px] font-bold uppercase tracking-widest">
                                    {kind === "oylik" ? t("kindOylik") : t("kindOverall")}
                                </span>
                            </div>
                            {loading ? (
                                <div className="mt-4 h-12 animate-pulse rounded-xl bg-muted" />
                            ) : rating ? (
                                <>
                                    <p className="mt-4 text-4xl font-black tabular-nums text-foreground">
                                        {rating.myRank}
                                        <span className="ml-2 text-lg font-semibold text-muted-foreground">
                                            {t("outOf").replace("{total}", String(rating.totalStudents))}
                                        </span>
                                    </p>
                                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        <span className={`rounded-lg px-2 py-1 font-extrabold tabular-nums ${accuracyColor(rating.myAvgAccuracy)}`}>
                                            {rating.myAvgAccuracy}%
                                        </span>
                                        <span>{t("attemptsCount").replace("{count}", String(rating.myAttempts))}</span>
                                    </div>
                                </>
                            ) : (
                                <p className="mt-4 text-sm text-muted-foreground">
                                    {kind === "oylik" ? t("noOylikYet") : t("noResultsYet")}
                                </p>
                            )}
                        </div>
                    );
                })}
            </section>

            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{t("methodNote")}</p>
        </div>
    );
}
