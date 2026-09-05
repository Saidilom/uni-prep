"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Users, Clock, ChevronRight, CheckCircle2 } from "lucide-react";
import { fetchMyReviewMocks, ReviewMock } from "@/lib/class-utils";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Тесты, назначенные этому аккаунту на проверку письменных работ
// (миграция 080). Фильтр по проверяющему делает не запрос, а RLS: чужие моки
// сюда просто не приходят.
//
// Публиковать результаты отсюда нельзя и не будет: finalize_mock_group_results
// требует автора теста или админа. Проверяющий ставит баллы, «Готово» жмёт
// супер-админ, когда убедится, что проверено всё.
export default function ReviewPage() {
    const t = useTranslations("reviewWork");
    const tSubjects = useTranslations("mockTestStudio");
    const [mocks, setMocks] = useState<ReviewMock[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                setMocks(await fetchMyReviewMocks());
            } catch {
                setMocks([]);
            }
            setLoading(false);
        })();
    }, []);

    const subjectLabel = (subjectId: string | null) => {
        if (!subjectId) return null;
        const key = `subject${subjectId.charAt(0).toUpperCase()}${subjectId.slice(1)}`;
        const label = tSubjects(key as never);
        return label === key ? subjectId : label;
    };

    return (
        <div className="flex flex-col gap-8 py-4">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{t("subtitle")}</p>
            </section>

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2].map((n) => <div key={n} className="h-20 animate-pulse rounded-2xl border border-border bg-muted" />)}
                    </div>
                ) : mocks.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-14 text-center dark:bg-muted/30">
                        <ClipboardCheck size={26} className="mx-auto mb-3 text-muted-foreground/50" />
                        <p className="font-medium text-muted-foreground">{t("nothingAssigned")}</p>
                        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground/70">{t("nothingAssignedHint")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {mocks.map((mock) => (
                            <Link
                                key={mock.mockTestId}
                                href={`/review/${mock.mockTestId}`}
                                className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                            >
                                <div className="flex min-w-0 items-center gap-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                                        <ClipboardCheck size={18} />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{mock.title}</p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            {subjectLabel(mock.subjectId) && <span>{subjectLabel(mock.subjectId)}</span>}
                                            <span className="flex items-center gap-1">
                                                <Users size={12} /> {t("takersLabel").replace("{count}", String(mock.takerCount))}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-3 self-start sm:self-auto">
                                    {mock.pendingCount > 0 ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300">
                                            <Clock size={12} /> {t("pendingLabel").replace("{count}", String(mock.pendingCount))}
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                                            <CheckCircle2 size={12} /> {t("allCheckedLabel")}
                                        </span>
                                    )}
                                    <ChevronRight size={16} className="text-muted-foreground" />
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
