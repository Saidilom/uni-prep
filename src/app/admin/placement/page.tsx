"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, FileText, Loader2, Sparkles, Star, Trash2, X } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { useToast } from "@/hooks/useToast";
import { getPlacementPublicationIssues, ImportedPlacementQuestion, ImportedPlacementTest } from "@/lib/placement-import-schema";
import { useTranslations } from "@/lib/i18n/locale-provider";

type TestRow = {
    id: string;
    title: string;
    time_limit_minutes: number | null;
    is_active: boolean;
    question_count: number;
};

export default function AdminPlacementPage() {
    const toast = useToast();
    const t = useTranslations("adminPlacement");
    const inputRef = useRef<HTMLInputElement>(null);
    const [tests, setTests] = useState<TestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [dragging, setDragging] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [draft, setDraft] = useState<ImportedPlacementTest | null>(null);
    const [publishing, setPublishing] = useState(false);
    const [publishIssues, setPublishIssues] = useState<string[]>([]);
    const [activating, setActivating] = useState<string | null>(null);

    const loadTests = useCallback(async () => {
        setLoading(true);
        const { data: rows } = await supabase
            .from("placement_tests")
            .select("id, title, time_limit_minutes, is_active")
            .order("created_at", { ascending: false });
        const list = (rows || []) as Omit<TestRow, "question_count">[];
        const counts = await Promise.all(
            list.map((t) => supabase.from("placement_questions").select("id", { count: "exact", head: true }).eq("test_id", t.id)),
        );
        setTests(list.map((t, i) => ({ ...t, question_count: counts[i].count ?? 0 })));
        setLoading(false);
    }, []);

    useEffect(() => { loadTests(); }, [loadTests]);

    const selectFile = (file: File | undefined) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".pdf")) {
            toast.error(t("needPdfFile"));
            return;
        }
        setPendingFile(file);
    };

    const runImport = async () => {
        if (!pendingFile) return;
        setImporting(true);
        setPublishIssues([]);
        try {
            const uploadInit = await fetch("/api/mock-tests/import/upload-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: pendingFile.name, size: pendingFile.size, kind: "test" }),
            });
            const uploadData = await uploadInit.json();
            if (!uploadInit.ok) throw new Error(uploadData.error || t("prepareUploadFailed"));
            const { error: directUploadError } = await supabase.storage
                .from("test-imports")
                .uploadToSignedUrl(uploadData.path, uploadData.token, pendingFile, { contentType: "application/pdf" });
            if (directUploadError) throw directUploadError;

            const response = await fetch("/api/placement/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    importId: uploadData.importId,
                    testFile: { path: uploadData.path, filename: pendingFile.name, size: pendingFile.size },
                }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || t("importErrorGeneric"));
            setDraft(body.draft as ImportedPlacementTest);
            setPendingFile(null);
            toast.success(t("pdfRecognizedToast"), { description: t("reviewBeforePublishToast") });
        } catch (error) {
            toast.error(t("geminiFailedToast"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setImporting(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const updateQuestion = (index: number, patch: Partial<ImportedPlacementQuestion>) => {
        setDraft((current) => {
            if (!current) return current;
            return { ...current, questions: current.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)) };
        });
    };

    const removeQuestion = (index: number) => {
        setDraft((current) => (current ? { ...current, questions: current.questions.filter((_, i) => i !== index) } : current));
    };

    const publish = async () => {
        if (!draft) return;
        const issues = getPlacementPublicationIssues(draft);
        setPublishIssues(issues);
        if (issues.length > 0) {
            document.getElementById("placement-issues")?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        setPublishing(true);
        try {
            const testId = crypto.randomUUID();
            const { error: testError } = await supabase.from("placement_tests").insert({
                id: testId,
                title: draft.title,
                description: draft.description,
                time_limit_minutes: draft.durationMinutes,
            });
            if (testError) throw testError;

            const questions = draft.questions.map((q, index) => ({
                id: crypto.randomUUID(),
                test_id: testId,
                text: q.prompt,
                options: Object.fromEntries(q.options.map((o) => [o.id, o.text])),
                correct_answer: q.correctOptionId,
                points: q.points || 1,
                order: index,
            }));
            const { error: questionsError } = await supabase.from("placement_questions").insert(questions);
            if (questionsError) throw questionsError;

            toast.success(t("testCreatedToast"));
            setDraft(null);
            await loadTests();
        } catch (error) {
            toast.error(t("publishFailedGeneric"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setPublishing(false);
        }
    };

    const activate = async (testId: string) => {
        setActivating(testId);
        try {
            const { error } = await supabase.rpc("set_active_placement_test", { p_test_id: testId });
            if (error) throw error;
            toast.success(t("activatedToast"));
            await loadTests();
        } catch (error) {
            toast.error(t("activateFailedToast"), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setActivating(null);
        }
    };

    const remove = async (testId: string) => {
        if (!confirm(t("deleteConfirm"))) return;
        const { error } = await supabase.from("placement_tests").delete().eq("id", testId);
        if (error) {
            toast.error(t("deleteFailedToast"), { description: error.message });
            return;
        }
        loadTests();
    };

    if (draft) {
        return (
            <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("reviewTitle")}</h1>
                        <p className="mt-2 text-sm text-muted-foreground">{t("reviewSubtitle")}</p>
                    </div>
                    <button onClick={() => setDraft(null)} className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors">{t("cancel")}</button>
                </div>

                <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="sm:col-span-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            {t("titleLabel")}
                            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-base font-semibold text-foreground" />
                        </label>
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            {t("timeMinutesLabel")}
                            <input type="number" min={1} value={draft.durationMinutes} onChange={(e) => setDraft({ ...draft, durationMinutes: Number(e.target.value) })} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground" />
                        </label>
                    </div>
                    {draft.warnings.length > 0 && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30">
                            <p className="flex items-center gap-2 font-bold"><AlertTriangle size={16} /> {t("reviewCarefully")}</p>
                            <ul className="mt-2 list-disc space-y-1 pl-5">{draft.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                        </div>
                    )}
                </section>

                <div className="space-y-3">
                    {draft.questions.map((q, index) => (
                        <article key={index} className={`rounded-2xl border bg-card p-5 shadow-sm ${!q.correctOptionId ? "border-amber-300" : "border-border"}`}>
                            <div className="mb-3 flex items-center gap-2">
                                <span className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">{q.number}</span>
                                <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${q.confidence >= 0.85 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{t("aiConfidenceLabel").replace("{percent}", String(Math.round(q.confidence * 100)))}</span>
                                <button onClick={() => removeQuestion(index)} className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600" aria-label={t("removeQuestionAria")}><Trash2 size={15} /></button>
                            </div>
                            <textarea value={q.prompt} onChange={(e) => updateQuestion(index, { prompt: e.target.value })} rows={2} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground" />
                            <div className="mt-3 space-y-2">
                                {q.options.map((option, optionIndex) => {
                                    const checked = q.correctOptionId === option.id;
                                    return (
                                        <div key={option.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${checked ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20" : "border-border"}`}>
                                            <button
                                                onClick={() => updateQuestion(index, { correctOptionId: option.id })}
                                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-background"}`}
                                                title={t("markCorrectAnswerTitle")}
                                            >
                                                {checked ? <Check size={14} /> : option.id.toUpperCase()}
                                            </button>
                                            <input
                                                value={option.text}
                                                onChange={(e) => {
                                                    const options = q.options.map((o, i) => (i === optionIndex ? { ...o, text: e.target.value } : o));
                                                    updateQuestion(index, { options });
                                                }}
                                                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </article>
                    ))}
                </div>

                {publishIssues.length > 0 && (
                    <div id="placement-issues" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 dark:bg-red-950/30">
                        <p className="font-bold">{t("fixBeforePublish")}</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5">{publishIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
                    </div>
                )}

                <div className="sticky bottom-3 flex items-center justify-between gap-4 rounded-2xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur">
                    <p className="text-sm font-bold">{draft.title} · {t("questionsCountSuffix").replace("{count}", String(draft.questions.length))}</p>
                    <button onClick={publish} disabled={publishing} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                        {publishing ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
                        {publishing ? t("publishing") : t("publish")}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("pageTitle")}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t("pageSubtitle")}
                </p>
            </section>

            {!pendingFile ? (
                <button
                    onClick={() => inputRef.current?.click()}
                    onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); selectFile(e.dataTransfer.files?.[0]); }}
                    className={`group flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${dragging ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-border bg-muted/30 hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/10"}`}
                >
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white shadow-sm"><FileText size={22} /></span>
                    <span className="mt-4 font-bold">{t("dropPdfHere")}</span>
                    <span className="mt-1 text-sm text-muted-foreground">{t("upTo32mb")}</span>
                </button>
            ) : (
                <div className="rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/50 p-6 dark:bg-blue-950/10">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <FileText size={18} className="shrink-0 text-blue-600" />
                            <p className="truncate text-sm font-semibold">{pendingFile.name}</p>
                        </div>
                        <button onClick={() => setPendingFile(null)} disabled={importing} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"><X size={16} /></button>
                    </div>
                    <div className="mt-5 flex items-center gap-3">
                        <button onClick={runImport} disabled={importing} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                            {importing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                            {importing ? t("geminiRecognizing") : t("recognizeTest")}
                        </button>
                    </div>
                    {importing && <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-600"><Loader2 size={16} className="animate-spin" /> {t("mayTakeAMinute")}</p>}
                </div>
            )}
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => selectFile(e.target.files?.[0])} />

            <section>
                <h2 className="mb-3 text-lg font-bold text-[hsl(var(--brand-blue-ink))]">{t("testsListTitle")}</h2>
                {loading ? (
                    <div className="space-y-3">{[1, 2].map((n) => <div key={n} className="h-20 animate-pulse rounded-2xl border border-border bg-muted" />)}</div>
                ) : tests.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">{t("noTestsYetUploadAbove")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {tests.map((test) => (
                            <div key={test.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="truncate font-semibold text-foreground">{test.title}</p>
                                        {test.is_active && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/40"><Star size={10} /> {t("activeLabel")}</span>}
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{t("statsLineTemplate").replace("{count}", String(test.question_count)).replace("{minutes}", String(test.time_limit_minutes ?? "—"))}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    {!test.is_active && (
                                        <button onClick={() => activate(test.id)} disabled={activating === test.id} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                                            {activating === test.id ? t("activatingEllipsis") : t("makeActive")}
                                        </button>
                                    )}
                                    <button onClick={() => remove(test.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
