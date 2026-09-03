"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  Send,
  Sparkles,
  Trophy,
} from "lucide-react";
import supabase from "@/lib/supabase/client";
import SafeMathText from "@/components/safe-math-text";
import { useAuthStore } from "@/store/useAuthStore";
import { invalidateStudentMockCaches } from "@/lib/registan-utils";
import { getMockEntryState } from "@/lib/mock-schedule";
import { gradeLevelDisplay, GradeLevel } from "@/lib/mock-grade-level";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

type AnswerValue = string | string[] | Record<string, string>;
type Question = {
  id: string;
  section_id: string;
  text: string;
  options: Record<string, string>;
  points: number;
  order: number;
  image_url?: string | null;
  question_type: string;
  content: {
    number?: string;
    sharedStimulus?: string | null;
    needsSourceImage?: boolean;
  };
  source_page?: number | null;
  source_file_index?: number | null;
  group_key?: string | null;
  requires_manual_review?: boolean;
};
type Section = { id: string; title: string; order: number; questions: Question[] };
type Result = {
  resultId: string;
  score: number;
  maxScore: number;
  total: number;
  percentage: number;
  hasPendingReview?: boolean;
  cefrScore?: number | null;
  cefrBand?: string | null;
  levelScore?: number | null;
  gradeLevel?: string | null;
  resultsPending?: boolean;
  resultsPublishAt?: string | null;
};

type AnswerReview = {
  question_id: string;
  question_text: string;
  selected_answer: string | null;
  is_correct: boolean;
  points_earned: number;
  max_points: number;
  review_status: string;
  review_feedback: string | null;
};

function isAnswered(value: AnswerValue | undefined) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value && Object.keys(value).length > 0);
}

export default function MockTestPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";
  const { user } = useAuthStore();
  const { locale } = useLocale();
  const t = useTranslations("mockRunner");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [review, setReview] = useState<AnswerReview[] | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const startedAtRef = useRef(Date.now());
  const autoSubmittedRef = useRef(false);

  const load = useCallback(async () => {
    if (!id || !user) return;
    setLoading(true);
    setError(null);

    // mock_tests_read_auth grants read on any *published* row regardless of
    // can_access_mock, so a scheduled-but-not-yet-open mock's metadata is
    // still visible here — used below to show a precise "opens at/closed"
    // message instead of the generic "not assigned" one.
    const { data: test, error: testError } = await supabase
      .from("mock_tests")
      .select("title,duration_minutes,subject_id,price,starts_at,ends_at")
      .eq("id", id)
      .single();
    if (testError || !test) {
      setError(t("testNotFound"));
      setLoading(false);
      return;
    }

    const { data: allowed, error: accessError } = await supabase.rpc("can_access_mock", { p_mock_test_id: id });
    if (accessError || !allowed) {
      const entryState = getMockEntryState({
        startsAt: test.starts_at,
        endsAt: test.ends_at,
        hasExistingResult: false,
      });
      if (entryState === "not_open_yet") {
        setError(t("opensAtNotice").replace("{date}", new Date(test.starts_at as string).toLocaleString()));
      } else if (entryState === "closed") {
        setError(t("entryWindowClosed"));
      } else {
        setError(t("notAssigned"));
      }
      setLoading(false);
      return;
    }

    setTitle(test.title);
    setSubject(test.subject_id);
    const rawSeconds = Math.max(60, Number(test.duration_minutes || 60) * 60);
    // A manually scheduled paid mock (ends_at set) must cut everyone off at
    // that exact moment regardless of the mock's own duration — clamp the
    // exam's own countdown to whichever is sooner, measured from THIS
    // student's own start point (not "now" — recomputing against "now" on
    // every reload would double-count the elapsed time, since `start`
    // itself is stable across reloads via localStorage below).
    const deadlineMs = test.ends_at ? new Date(test.ends_at as string).getTime() : null;
    if (isPreview) {
      // Preview is a read-only walkthrough for the author/admin — it must
      // never touch the real per-user attempt timer, or reuse of a stale
      // localStorage entry from an earlier real attempt on this same test
      // would read as already-expired and auto-submit the moment it loads.
      startedAtRef.current = Date.now();
      const seconds = deadlineMs ? Math.max(0, Math.min(rawSeconds, Math.floor((deadlineMs - Date.now()) / 1000))) : rawSeconds;
      setDurationSeconds(seconds);
      setTimeLeft(seconds);
    } else {
      const storageKey = `mock_start_${id}_${user.id}`;
      const stored = window.localStorage.getItem(storageKey);
      const start = stored ? Number(stored) : Date.now();
      if (!stored) window.localStorage.setItem(storageKey, String(start));
      startedAtRef.current = start;
      const seconds = deadlineMs ? Math.max(0, Math.min(rawSeconds, Math.floor((deadlineMs - start) / 1000))) : rawSeconds;
      setDurationSeconds(seconds);
      setTimeLeft(Math.max(0, seconds - Math.floor((Date.now() - start) / 1000)));

      // The timer already survives a reload via mock_start_*, but the picked
      // answers themselves were pure in-memory state — a refresh mid-exam
      // wiped every selected answer even though the clock kept counting.
      try {
        const savedAnswers = window.localStorage.getItem(`mock_answers_${id}_${user.id}`);
        if (savedAnswers) setAnswers(JSON.parse(savedAnswers));
      } catch {
        window.localStorage.removeItem(`mock_answers_${id}_${user.id}`);
      }
    }

    const { data: sectionRows } = await supabase.from("mock_sections").select("*").eq("mock_test_id", id).order("order");
    const loaded: Section[] = [];
    for (const section of sectionRows || []) {
      const { data: questionRows, error: questionError } = await supabase.rpc("get_mock_questions_v2", { p_section_id: section.id });
      if (questionError) {
        setError(questionError.message);
        setLoading(false);
        return;
      }
      loaded.push({ id: section.id, title: section.title, order: section.order, questions: (questionRows || []) as Question[] });
    }
    setSections(loaded);
    setLoading(false);
  }, [id, user, isPreview, t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (isPreview || loading || result || timeLeft <= 0) return;
    const timer = window.setInterval(() => setTimeLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [loading, result, timeLeft]);

  useEffect(() => {
    if (isPreview || !id || !user || loading) return;
    try {
      window.localStorage.setItem(`mock_answers_${id}_${user.id}`, JSON.stringify(answers));
    } catch {
      // storage full/unavailable — the attempt still works, just won't survive a reload
    }
  }, [answers, isPreview, id, user, loading]);

  useEffect(() => {
    if (isPreview || loading || result) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isPreview, loading, result]);

  const questions = useMemo(() => sections.flatMap((section) => section.questions.map((question) => ({ ...question, sectionTitle: section.title }))), [sections]);
  const answeredCount = questions.filter((question) => isAnswered(answers[question.id])).length;

  const submit = useCallback(async () => {
    if (!id || submitting || result || isPreview) return;
    setSubmitting(true);
    setError(null);
    try {
      const spent = Math.max(0, Math.min(durationSeconds, Math.floor((Date.now() - startedAtRef.current) / 1000)));
      const { data, error: submitError } = await supabase.rpc("submit_mock", {
        p_mock_test_id: id,
        p_answers: answers,
        p_time_spent_seconds: spent,
      });
      if (submitError) throw submitError;
      const submitted = data as Result;
      setResult(submitted);
      if (user) {
        window.localStorage.removeItem(`mock_start_${id}_${user.id}`);
        window.localStorage.removeItem(`mock_answers_${id}_${user.id}`);
        invalidateStudentMockCaches(user.id);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });

      const recalculateRasch = () => fetch("/api/rasch/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mockTestId: id }),
      }).catch(() => undefined);
      // CEFR применим только к английскому. Роут это тоже проверяет, но
      // вызывать его для остальных предметов незачем — это лишний круг.
      const recalculateCefr = () => (subject === "english"
        ? fetch(`/api/mock-tests/${id}/cefr-recalculate`, { method: "POST" }).catch(() => undefined)
        : Promise.resolve(undefined));

      if (submitted.resultsPending) {
        // Результат скрыт до публикации, поэтому считать здесь нечего и
        // незачем. Проверка эссе, пересчёт Раша и CEFR выполняются один раз
        // при нажатии «Готово» — по всей группе сразу.
        //
        // Раньше всё это запускалось на КАЖДОЙ сдаче и пересчитывало группу
        // целиком: на 100 учениках медиана вызова пересчёта была 119 секунд,
        // 53 из 100 не возвращались за две минуты, а ученические чтения
        // просаживались с 2,4 до 10,2 секунды. Сложность была квадратичной.
        return;
      }

      // Essay/writing questions come back from submit_mock as pending —
      // grade them against the official rubric right away instead of
      // leaving the student staring at a score that's missing a whole
      // section until a teacher happens to open the review page.
      let fetchedReview: AnswerReview[] | null = null;
      if (submitted.hasPendingReview) {
        setGrading(true);
        try {
          await fetch("/api/mock-responses/ai-grade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resultId: submitted.resultId }),
          }).catch(() => undefined);
          const [{ data: refreshed }, { data: details }] = await Promise.all([
            supabase.from("mock_results").select("score, accuracy").eq("id", submitted.resultId).single(),
            supabase.rpc("get_my_mock_answer_review", { p_result_id: submitted.resultId }),
          ]);
          fetchedReview = (details as AnswerReview[]) || [];
          if (refreshed) {
            setResult({
              ...submitted,
              score: refreshed.score,
              percentage: refreshed.accuracy,
              hasPendingReview: fetchedReview.some((d) => d.review_status === "pending"),
            });
          }
        } finally {
          setGrading(false);
          // Recalculate once the essay's is_correct is settled, not before —
          // otherwise Rasch calibrates against an essay item that always
          // reads as incorrect just because grading hadn't finished yet,
          // and the level would be computed from an unfinished (zero)
          // essay score.
          await recalculateRasch();
        }
      } else {
        await recalculateRasch();
      }

      // Awaited (like CEFR below) so the student sees their level on this
      // same screen instead of it only ever landing quietly in the
      // database — needs a real cohort to be meaningful (see
      // raschThetaToT's fallback-to-50 comment), but is cheap either way.
      const { data: levelRow } = await supabase
        .from("mock_results")
        .select("level_score, grade_level")
        .eq("id", submitted.resultId)
        .single();
      if (levelRow?.grade_level) {
        setResult((current) => (current ? { ...current, levelScore: levelRow.level_score, gradeLevel: levelRow.grade_level } : current));
      }

      // Awaited so an English student actually sees their CEFR band on this
      // same screen instead of it only ever landing quietly in the
      // database. Cheap no-op for every other subject — the route itself
      // short-circuits immediately.
      await recalculateCefr();
      const { data: cefrRow } = await supabase
        .from("mock_results")
        .select("cefr_score, cefr_band")
        .eq("id", submitted.resultId)
        .single();
      if (cefrRow?.cefr_band) {
        setResult((current) => (current ? { ...current, cefrScore: cefrRow.cefr_score, cefrBand: cefrRow.cefr_band } : current));
      }

      // Per-question correct/incorrect breakdown, shown right below the
      // score on this same screen. Reuse the review data already fetched
      // above for the AI-grading branch instead of calling the RPC twice.
      if (!fetchedReview) {
        const { data: reviewData } = await supabase.rpc("get_my_mock_answer_review", { p_result_id: submitted.resultId });
        fetchedReview = (reviewData as AnswerReview[]) || [];
      }
      setReview(fetchedReview);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }, [answers, durationSeconds, id, result, submitting, user, isPreview, subject, t]);

  useEffect(() => {
    if (isPreview) return;
    if (timeLeft === 0 && !loading && questions.length > 0 && !result && !submitting && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      submit();
    }
  }, [isPreview, loading, questions.length, result, submit, submitting, timeLeft]);

  const setAnswer = (questionId: string, value: AnswerValue) => setAnswers((current) => ({ ...current, [questionId]: value }));
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-muted/40"><Loader2 className="animate-spin text-primary" size={30} /></div>;
  if (error && sections.length === 0) return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-5"><div className="max-w-md rounded-3xl border border-border bg-background p-8 text-center"><AlertCircle className="mx-auto text-red-500" /><h1 className="mt-4 text-xl font-bold">{t("testUnavailable")}</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p><button onClick={() => router.back()} className="mt-6 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">{t("goBack")}</button></div></div>
  );

  if (result) return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-muted/40 p-5 py-10">
      <div className="w-full max-w-xl rounded-3xl border border-border bg-background p-8 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--brand-blue-soft))] text-[hsl(var(--brand-blue-ink))]"><Trophy size={27} /></span>
        <h1 className="mt-5 text-3xl font-bold">{t("testCompleted")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{title}</p>
        {result.resultsPending ? (
          <p className="mx-auto mt-8 max-w-xs rounded-2xl border border-[hsl(var(--brand-blue))]/20 bg-[hsl(var(--brand-blue-soft))] px-5 py-4 text-sm font-semibold text-[hsl(var(--brand-blue-ink))]">
            {result.resultsPublishAt
              ? t("resultsPendingNotice").replace("{date}", new Date(result.resultsPublishAt).toLocaleString())
              : t("resultsPendingNoticeNoDate")}
          </p>
        ) : (
          <>
            <p className="mt-8 text-6xl font-black tabular-nums">{result.score} <span className="text-3xl text-muted-foreground">/ {result.maxScore}</span></p>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("pointsLabel")}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("percentageSecondary").replace("{percent}", String(result.percentage))}</p>
            {result.levelScore != null && (
              result.gradeLevel ? (
                <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <span className="text-lg font-black text-emerald-700 dark:text-emerald-400">{gradeLevelDisplay(result.gradeLevel as GradeLevel, locale)}</span>
                  <span className="text-xs font-semibold text-emerald-700/70 dark:text-emerald-400/70">{result.levelScore} {t("levelScaleSuffix")}</span>
                </div>
              ) : (
                <p className="mx-auto mt-4 max-w-xs text-xs text-muted-foreground">{t("noCertificateNotice")}</p>
              )
            )}
            {result.cefrBand && (
              <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-2xl border border-[hsl(var(--brand-blue))]/20 bg-[hsl(var(--brand-blue-soft))] px-4 py-2">
                <span className="text-lg font-black text-[hsl(var(--brand-blue-ink))]">{result.cefrBand}</span>
                <span className="text-xs font-semibold text-[hsl(var(--brand-blue-ink))]/70">{result.cefrScore} {t("cefrScaleSuffix")}</span>
              </div>
            )}
            {grading && (
              <p className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
                <Loader2 size={15} className="animate-spin" /> {t("aiGrading")}
              </p>
            )}
            {!grading && result.hasPendingReview && <p className="mt-5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">{t("pendingReviewNotice")}</p>}
          </>
        )}
        <button onClick={() => router.push("/results")} disabled={grading} className="mt-7 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">{t("toResults")}</button>
      </div>

      {!result.resultsPending && review && review.length > 0 && (
        <div className="w-full max-w-2xl">
          <h2 className="mb-4 text-center text-xl font-bold text-foreground">{t("answerReviewTitle")}</h2>
          <div className="space-y-2">
            {review.map((r, i) => (
              <div
                key={r.question_id}
                className={`flex items-start gap-3 rounded-2xl border p-4 ${r.is_correct ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20"}`}
              >
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${r.is_correct ? "bg-emerald-500" : "bg-red-500"}`}>
                  {r.is_correct ? <Check size={14} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1 text-left">
                  <SafeMathText content={r.question_text} className="text-sm font-medium text-foreground" />
                  <p className={`mt-1.5 text-xs font-bold uppercase tracking-wide ${r.is_correct ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                    {r.is_correct ? t("answerCorrectLabel") : t("answerIncorrectLabel")} · {r.points_earned}/{r.max_points}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <button onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border hover:bg-muted"><ArrowLeft size={18} /></button>
          <div className="min-w-0 flex-1"><h1 className="truncate font-bold">{title}</h1><p className="text-xs text-muted-foreground">{subject || "Mock"} · {t("answeredStatus").replace("{answered}", String(answeredCount)).replace("{total}", String(questions.length))}</p></div>
          {isPreview ? (
            <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--brand-blue))]/20 bg-[hsl(var(--brand-blue-soft))] px-3 py-2 text-sm font-bold text-[hsl(var(--brand-blue-ink))]"><Sparkles size={16} /> {t("previewBadge")}</div>
          ) : (
            <>
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold tabular-nums ${timeLeft < 300 ? "border-red-200 bg-red-50 text-red-700" : "border-border"}`}><Clock size={16} /> {formatTime(timeLeft)}</div>
              <button onClick={() => {
                const missing = questions.length - answeredCount;
                if (missing > 0 && !window.confirm(t("confirmMissingAnswers").replace("{missing}", String(missing)))) return;
                submit();
              }} disabled={submitting} className="hidden items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50 sm:inline-flex">{submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t("finish")}</button>
            </>
          )}
        </div>
        {isPreview && <div className="border-t border-[hsl(var(--brand-blue))]/15 bg-[hsl(var(--brand-blue-soft))] px-4 py-2 text-center text-xs font-semibold text-[hsl(var(--brand-blue-ink))] sm:px-6">{t("previewNotice")}</div>}
        {!isPreview && <div className="h-1 bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${questions.length ? answeredCount / questions.length * 100 : 0}%` }} /></div>}
        {/* Mobile/tablet stand-in for the question-jump navigator, which is
            `hidden lg:block` as a fixed aside below — without this, a student
            on a phone has no way to jump to a specific question at all. */}
        <div className="border-t border-border bg-background/95 px-4 py-2 sm:px-6 lg:hidden">
          <div className="flex gap-1.5 overflow-x-auto">
            {questions.map((question, index) => (
              <a
                key={question.id}
                href={`#question-${question.id}`}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${isAnswered(answers[question.id]) ? "bg-emerald-600 text-white" : "bg-muted text-foreground"}`}
              >
                {question.content?.number || index + 1}
              </a>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        <main className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
          {sections.map((section) => (
            <section key={section.id}>
              <div className="border-b border-border bg-muted/40 px-5 py-4 sm:px-8"><p className="text-xs font-bold uppercase tracking-widest text-primary">{t("sectionLabel")}</p><h2 className="mt-1 text-xl font-bold">{section.title}</h2></div>
              <div className="divide-y divide-border">
                {section.questions.map((question, questionIndex) => {
                  const previous = section.questions[questionIndex - 1];
                  const showShared = Boolean(question.content?.sharedStimulus) && (!question.group_key || previous?.group_key !== question.group_key);
                  const selected = answers[question.id];
                  return (
                    <article id={`question-${question.id}`} key={question.id} className="scroll-mt-24 px-5 py-7 sm:px-8">
                      <div className="flex items-start gap-4">
                        <span className={`flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl px-2 text-sm font-black ${isAnswered(selected) ? "bg-emerald-600 text-white" : "bg-muted text-foreground"}`}>{question.content?.number || questionIndex + 1}</span>
                        <div className="min-w-0 flex-1">
                          {showShared && <SafeMathText content={question.content.sharedStimulus || ""} className="mb-5 rounded-xl border border-border bg-muted/30 p-4 text-sm" />}
                          <SafeMathText content={question.text} className="text-[15px] font-semibold sm:text-base" />
                          {question.points > 0 && <p className="mt-1 text-xs text-muted-foreground">{t("pointsSuffix").replace("{points}", String(question.points))}</p>}

                          {question.content?.needsSourceImage && question.source_page && (
                            <details className="mt-4 overflow-hidden rounded-xl border border-[hsl(var(--brand-blue))]/20 bg-[hsl(var(--brand-blue-soft))]/60" open>
                              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold text-[hsl(var(--brand-blue-ink))]"><Eye size={16} /> {t("sourceImageLabel").replace("{page}", String(question.source_page))}</summary>
                              <iframe title={t("sourceIframeTitle").replace("{number}", question.content.number || "")} src={`/api/mock-tests/${id}/source?page=${question.source_page}&file=${question.source_file_index ?? 0}`} className="h-[300px] w-full border-t border-[hsl(var(--brand-blue))]/20 bg-white sm:h-[520px]" />
                            </details>
                          )}

                          {["single_choice", "true_false", "matching"].includes(question.question_type || "single_choice") && (
                            <div className="mt-5 grid gap-2">
                              {Object.entries(question.options || {}).map(([key, value]) => (
                                <button key={key} onClick={() => setAnswer(question.id, key)} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${selected === key ? "border-primary bg-[hsl(var(--brand-blue-soft))] ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}>
                                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${selected === key ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{selected === key ? <Check size={15} /> : key.toUpperCase()}</span>
                                  <SafeMathText content={String(value)} as="span" className="text-sm" />
                                </button>
                              ))}
                            </div>
                          )}

                          {question.question_type === "multiple_choice" && (
                            <div className="mt-5 grid gap-2">
                              {Object.entries(question.options || {}).map(([key, value]) => {
                                const values = Array.isArray(selected) ? selected : [];
                                const checked = values.includes(key);
                                return <button key={key} onClick={() => setAnswer(question.id, checked ? values.filter((item) => item !== key) : [...values, key])} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left ${checked ? "border-primary bg-[hsl(var(--brand-blue-soft))]" : "border-border"}`}><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${checked ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{checked ? <Check size={15} /> : key.toUpperCase()}</span><SafeMathText content={String(value)} as="span" className="text-sm" /></button>;
                              })}
                            </div>
                          )}

                          {["short_text", "numeric", "math_expression", "ordering", "table_completion"].includes(question.question_type) && (
                            <input value={typeof selected === "string" ? selected : ""} onChange={(event) => setAnswer(question.id, event.target.value)} placeholder={question.question_type === "math_expression" ? t("mathExpressionPlaceholder") : t("answerPlaceholder")} className="mt-5 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                          )}

                          {question.question_type === "essay" && (
                            <textarea value={typeof selected === "string" ? selected : ""} onChange={(event) => setAnswer(question.id, event.target.value)} rows={10} placeholder={t("essayPlaceholder")} className="mt-5 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-border bg-background p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("navigationLabel")}</p>
            <div className="mt-3 grid grid-cols-5 gap-2">{questions.map((question, index) => <a key={question.id} href={`#question-${question.id}`} className={`flex h-8 items-center justify-center rounded-lg text-xs font-bold ${isAnswered(answers[question.id]) ? "bg-emerald-600 text-white" : "bg-muted hover:bg-muted/70"}`}>{question.content?.number || index + 1}</a>)}</div>
            {!isPreview && <button onClick={() => submit()} disabled={submitting} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">{submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {t("finish")}</button>}
            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
          </div>
        </aside>
      </div>

      {!isPreview && <div className="sticky bottom-0 z-30 border-t border-border bg-background p-3 sm:hidden"><button onClick={() => submit()} disabled={submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">{submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t("finishTest")}</button></div>}
    </div>
  );
}
