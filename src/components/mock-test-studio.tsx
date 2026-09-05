"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  CalendarClock,
  Eye,
  FileText,
  ClipboardCheck,
  ListChecks,
  Lock,
  LockOpen,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
  Wallet,
  X,
} from "lucide-react";
import supabase from "@/lib/supabase/client";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/useToast";
import { pageCache } from "@/lib/page-cache";
import {
  countResponseItems,
  getPublicationIssues,
  ImportedMock,
  ImportedQuestion,
  ImportedSection,
  MOCK_QUESTION_TYPES,
  MockImportResponse,
} from "@/lib/mock-import-schema";
import { sumPoints } from "@/lib/mock-points";
import { fetchOylikSets, fetchReviewerCandidates, fetchMockReviewerId, setMockReviewer, OylikSet, ReviewerCandidate } from "@/lib/class-utils";
import { useLocale, useTranslations } from "@/lib/i18n/locale-provider";

type StudioMode = "admin" | "teacher";
type TestRow = {
  id: string;
  title: string;
  type: string;
  price: number;
  duration_minutes: number;
  subject_id: string | null;
  language: string | null;
  status: string;
  creator_name: string;
  question_count: number;
  created_at: string;
  closed_at: string | null;
  starts_at: string | null;
  results_publish_at: string | null;
  completed_count: number;
};

type TeacherClass = { id: string; name: string };
type StudentTarget = { id: string; name: string; surname: string | null; shortid: string | null; className: string };

// A single English mock is commonly built from separate Reading/Writing/
// Listening papers (sometimes a 4th part too) — this needs to fit that
// without letting an import balloon into something Gemini can't finish
// inside the request's own timeout budget.
const MAX_TEST_FILES = 4;

function formatMoney(value: number, locale: "ru" | "uz", sumWord: string) {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "uz-UZ").format(value) + " " + sumWord;
}

function isChoiceQuestion(question: ImportedQuestion) {
  return ["single_choice", "multiple_choice", "true_false", "matching"].includes(question.type);
}

function emptyQuestion(order: number, reviewNote: string): ImportedQuestion {
  return {
    number: String(order + 1),
    type: "single_choice",
    prompt: "",
    options: ["a", "b", "c", "d"].map((id) => ({ id, text: "" })),
    correctOptionIds: [],
    acceptedAnswers: [],
    answerOrigin: "missing",
    points: 1,
    order,
    groupKey: null,
    sharedStimulus: null,
    sourcePage: 1,
    sourceFileIndex: 0,
    needsSourceImage: false,
    requiresManualReview: false,
    confidence: 1,
    reviewNote,
    rubricNote: null,
  };
}

export default function MockTestStudio({ mode }: { mode: StudioMode }) {
  const { user } = useAuthStore();
  const { locale } = useLocale();
  const t = useTranslations("mockTestStudio");
  const toast = useToast();

  const SUBJECT_LABELS: Record<string, string> = useMemo(() => ({
    math: t("subjectMath"),
    physics: t("subjectPhysics"),
    chemistry: t("subjectChemistry"),
    biology: t("subjectBiology"),
    geography: t("subjectGeography"),
    history: t("subjectHistory"),
    english: t("subjectEnglish"),
    russian: t("subjectRussian"),
    uzbek: t("subjectUzbek"),
    it: t("subjectIt"),
    other: t("subjectOther"),
  }), [t]);

  const QUESTION_LABELS: Record<string, string> = useMemo(() => ({
    single_choice: t("questionSingleChoice"),
    multiple_choice: t("questionMultipleChoice"),
    true_false: t("questionTrueFalse"),
    short_text: t("questionShortText"),
    numeric: t("questionNumeric"),
    math_expression: t("questionMathExpression"),
    matching: t("questionMatching"),
    ordering: t("questionOrdering"),
    table_completion: t("questionTableCompletion"),
    essay: t("questionEssay"),
  }), [t]);
  const inputRef = useRef<HTMLInputElement>(null);
  const answersInputRef = useRef<HTMLInputElement>(null);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [pendingTests, setPendingTests] = useState<File[]>([]);
  const [pendingAnswers, setPendingAnswers] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<MockImportResponse | null>(null);
  const [draft, setDraft] = useState<ImportedMock | null>(null);
  const [price, setPrice] = useState(0);
  // Админ выбирает тип теста переключателем: платный (по умолчанию, как было)
  // или бесплатный. Бесплатный сохраняет всю логику платного — окно
  // проведения, ручное закрытие, ручную публикацию результатов — просто без
  // оплаты. Учителю переключатель не показывается, его тесты всегда class_only.
  const [isFree, setIsFree] = useState(false);
  // Комплект «Ойлик тест»: если выбран, тест публикуется как class_only и
  // раздаётся группам по предмету (миграция 073), а платность и цена к нему
  // не применяются.
  const [oylikSetId, setOylikSetId] = useState("");
  const [oylikSets, setOylikSets] = useState<OylikSet[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [resultsPublishAt, setResultsPublishAt] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);
  const [assigningTest, setAssigningTest] = useState<TestRow | null>(null);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [students, setStudents] = useState<StudentTarget[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [togglingClose, setTogglingClose] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState<string | null>(null);
  // Дата публикации результатов задавалась только при создании и потом была
  // недоступна — а до её наступления finalize_mock_group_results отказывает
  // публиковать. Админ упирался в это без возможности что-либо изменить.
  const [editingPublishAt, setEditingPublishAt] = useState<TestRow | null>(null);
  const [publishAtDraft, setPublishAtDraft] = useState("");
  const [savingPublishAt, setSavingPublishAt] = useState(false);
  const [editingPricing, setEditingPricing] = useState<TestRow | null>(null);
  const [pricingFreeDraft, setPricingFreeDraft] = useState(false);
  const [pricingPriceDraft, setPricingPriceDraft] = useState(0);
  const [savingPricing, setSavingPricing] = useState(false);
  // Назначение проверяющего письменных работ (миграция 080).
  const [editingReviewer, setEditingReviewer] = useState<TestRow | null>(null);
  const [reviewerCandidates, setReviewerCandidates] = useState<ReviewerCandidate[]>([]);
  const [reviewerDraft, setReviewerDraft] = useState("");
  const [reviewerLoading, setReviewerLoading] = useState(false);
  const [savingReviewer, setSavingReviewer] = useState(false);

  // The reviewed-but-unpublished draft must survive an accidental page reload
  // (dev-server hot reload, browser refresh, tab restore) — losing a fully
  // recognized test because of that felt like a "reset" to the user even
  // though no button was pressed. Persisted only for the post-recognition
  // review stage: pendingTests/pendingAnswers are raw File objects and can't
  // be serialized, so a reload before "Распознать тест" still needs re-attaching.
  const draftStorageKey = `mock-import-draft:${mode}`;
  const skipNextPersist = useRef(true);
  // Распознавание PDF занимает минуты, и до этого «Отмена» была заблокирована
  // на всё это время — выбрав не тот файл, оставалось только досидеть до конца.
  // Контроллер обрывает и подготовку загрузки, и сам вызов распознавания.
  const importAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftStorageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { draft: ImportedMock; importResult: MockImportResponse; price: number; isFree?: boolean };
        if (saved?.draft && saved?.importResult) {
          setDraft(saved.draft);
          setImportResult(saved.importResult);
          if (typeof saved.price === "number") setPrice(saved.price);
          if (typeof saved.isFree === "boolean") setIsFree(saved.isFree);
        }
      }
    } catch {
      sessionStorage.removeItem(draftStorageKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    try {
      if (draft && importResult) {
        sessionStorage.setItem(draftStorageKey, JSON.stringify({ draft, importResult, price, isFree }));
      } else {
        sessionStorage.removeItem(draftStorageKey);
      }
    } catch {
      // storage full/unavailable — recognized draft still works, just won't survive a reload
    }
  }, [draft, importResult, price, isFree, draftStorageKey]);

  useEffect(() => {
    if (!draft || !importResult) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draft, importResult]);

  const loadTests = useCallback(async (opts?: { force?: boolean }) => {
    setLoading(true);
    const cacheKey = `mockTestsList:${mode}`;
    if (opts?.force) pageCache.invalidate(cacheKey);
    try {
      const tests = await pageCache.fetch(cacheKey, async () => {
        const response = await fetch("/api/mock-tests", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || t("loadTestsFailed"));
        return (body.tests || []) as TestRow[];
      }, 60 * 1000);
      setTests(tests);
    } catch (error) {
      toast.error(t("loadMocksFailed"), { description: String(error) });
    } finally {
      setLoading(false);
    }
  }, [toast, mode, t]);

  useEffect(() => { loadTests(); }, [loadTests]);

  // Список комплектов нужен только админу и только чтобы привязать к ним
  // публикуемый тест — учителю он не показывается вовсе.
  useEffect(() => {
    if (mode !== "admin") return;
    fetchOylikSets().then(setOylikSets).catch(() => setOylikSets([]));
  }, [mode]);

  const addTestFiles = (fileList: FileList | File[] | null | undefined) => {
    if (!fileList) return;
    const incoming = Array.from(fileList);
    if (incoming.some((file) => !file.name.toLowerCase().endsWith(".pdf"))) {
      toast.error(t("needPdfFile"));
      return;
    }
    setPendingTests((current) => {
      const merged = [...current, ...incoming];
      if (merged.length > MAX_TEST_FILES) {
        toast.error(t("tooManyTestFiles").replace("{max}", String(MAX_TEST_FILES)));
        return merged.slice(0, MAX_TEST_FILES);
      }
      return merged;
    });
  };

  const removeTestFile = (index: number) => {
    setPendingTests((current) => current.filter((_, i) => i !== index));
  };

  const selectAnswers = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error(t("needPdfFile"));
      return;
    }
    setPendingAnswers(file);
  };

  const uploadStoredFile = async (file: File, importId: string | undefined, kind: "test" | "answers", signal?: AbortSignal) => {
    const uploadInit = await fetch("/api/mock-tests/import/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, size: file.size, importId, kind }),
      signal,
    });
    const uploadData = await uploadInit.json();
    if (!uploadInit.ok) throw new Error(uploadData.error || t("prepareUploadFailed"));
    const { error: directUploadError } = await supabase.storage
      .from("test-imports")
      .uploadToSignedUrl(uploadData.path, uploadData.token, file, { contentType: "application/pdf" });
    if (directUploadError) throw directUploadError;
    // uploadToSignedUrl в supabase-js не принимает AbortSignal, поэтому саму
    // заливку не прервать — но дальше по цепочке идти уже незачем. Проверяем
    // руками, а не через signal.throwIfAborted(): его нет в браузерах старше
    // 2022 года, а тихо упасть здесь хуже, чем лишняя строка.
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return { importId: uploadData.importId as string, path: uploadData.path as string, filename: file.name, size: file.size };
  };

  const runImport = async () => {
    if (pendingTests.length === 0) return;
    setImporting(true);
    setPublishIssues([]);
    const controller = new AbortController();
    importAbortRef.current = controller;
    const { signal } = controller;
    try {
      const firstTestFile = await uploadStoredFile(pendingTests[0], undefined, "test", signal);
      const restTestFiles = await Promise.all(
        pendingTests.slice(1).map((file) => uploadStoredFile(file, firstTestFile.importId, "test", signal)),
      );
      const testFiles = [firstTestFile, ...restTestFiles];
      const answersFile = pendingAnswers ? await uploadStoredFile(pendingAnswers, firstTestFile.importId, "answers", signal) : undefined;
      const response = await fetch("/api/mock-tests/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId: firstTestFile.importId, testFiles, answersFile }),
        signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t("importErrorGeneric"));
      setImportResult(body as MockImportResponse);
      setDraft((body as MockImportResponse).draft);
      setPendingTests([]);
      setPendingAnswers(null);
      toast.success(t("pdfRecognizedToast"), { description: t("reviewBeforePublishToast") });
    } catch (error) {
      // Отмена — не сбой: сообщение о ней уже показала cancelImport, и второй
      // тост с красной ошибкой только сбивал бы с толку.
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      toast.error(t("geminiFailedToast"), { description: error instanceof Error ? error.message : String(error) });
    } finally {
      if (importAbortRef.current === controller) importAbortRef.current = null;
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
      if (answersInputRef.current) answersInputRef.current.value = "";
    }
  };

  // Файлы после отмены НЕ сбрасываются: отменяют обычно потому, что заметили
  // не тот файл, и заставлять выбирать оба заново — ровно та работа, которую
  // человек и пытался прервать. Достаточно удалить лишний и запустить снова.
  const cancelImport = () => {
    importAbortRef.current?.abort();
    importAbortRef.current = null;
    setImporting(false);
    toast.info(t("importCancelledToast"));
  };

  const cancelPending = () => {
    setPendingTests([]);
    setPendingAnswers(null);
    if (inputRef.current) inputRef.current.value = "";
    if (answersInputRef.current) answersInputRef.current.value = "";
  };

  const updateQuestion = (sectionIndex: number, questionIndex: number, patch: Partial<ImportedQuestion>) => {
    setDraft((current) => {
      if (!current) return current;
      const sections = current.sections.map((section, sIndex) =>
        sIndex !== sectionIndex
          ? section
          : {
              ...section,
              questions: section.questions.map((question, qIndex) =>
                qIndex === questionIndex ? { ...question, ...patch } : question,
              ),
            },
      );
      return { ...current, sections };
    });
  };

  // Adding/removing a whole question changes how many slices the 75-point
  // pool needs to split into, so it's re-normalized right here — otherwise
  // every add/remove would silently drift the total away from 75 again and
  // the reviewer would only find out from the publish-time error. A plain
  // points-field edit does NOT go through this (see updateQuestion above) —
  // renormalizing on every keystroke would fight whatever number they're
  // actually trying to type in.
  const removeQuestion = (sectionIndex: number, questionIndex: number) => {
    setDraft((current) => {
      if (!current) return current;
      return ({
        ...current,
        sections: current.sections.map((section, sIndex) =>
          sIndex === sectionIndex
            ? { ...section, questions: section.questions.filter((_, qIndex) => qIndex !== questionIndex) }
            : section,
        ),
      });
    });
  };

  const addQuestion = (sectionIndex: number) => {
    setDraft((current) => {
      if (!current) return current;
      return ({
        ...current,
        sections: current.sections.map((section, index) => index === sectionIndex
          ? { ...section, questions: [...section.questions, emptyQuestion(section.questions.length, t("addedManually"))] }
          : section),
      });
    });
  };

  const addSection = () => {
    setDraft((current) => {
      if (!current) return current;
      const section: ImportedSection = {
        title: t("sectionTitleTemplate").replace("{number}", String(current.sections.length + 1)),
        kind: "general",
        instructions: "",
        order: current.sections.length,
        questions: [emptyQuestion(0, t("addedManually"))],
      };
      return ({ ...current, sections: [...current.sections, section] });
    });
  };

  const publish = async () => {
    if (!draft || !importResult) return;
    const issues = getPublicationIssues(draft);
    if (mode === "admin" && !isFree && !oylikSetId && price <= 0) issues.unshift(t("addPricePrompt"));
    if (mode === "admin" && startsAt && !endsAt) issues.unshift(t("endsAtRequiredPrompt"));
    if (mode === "admin" && endsAt && !startsAt) issues.unshift(t("startsAtRequiredPrompt"));
    if (mode === "admin" && startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      issues.unshift(t("endsBeforeStartPrompt"));
    }
    if (mode === "admin" && startsAt && resultsPublishAt && new Date(resultsPublishAt) < new Date(startsAt)) {
      issues.unshift(t("resultsBeforeStartPrompt"));
    }
    setPublishIssues(issues);
    if (issues.length > 0) {
      document.getElementById("studio-issues")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setPublishing(true);
    try {
      const response = await fetch("/api/mock-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          importId: importResult.importId,
          sourcePdfPaths: importResult.sourcePdfPaths,
          isFree: mode === "admin" ? isFree : false,
          price: mode === "admin" && !isFree && !oylikSetId ? price : 0,
          oylikSetId: mode === "admin" && oylikSetId ? oylikSetId : null,
          startsAt: mode === "admin" && startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: mode === "admin" && endsAt ? new Date(endsAt).toISOString() : null,
          resultsPublishAt: mode === "admin" && resultsPublishAt ? new Date(resultsPublishAt).toISOString() : null,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (Array.isArray(body.issues)) setPublishIssues(body.issues);
        throw new Error(body.error || t("publishFailedGeneric"));
      }
      toast.success(mode === "admin" && !isFree ? t("paidMockPublishedToast") : t("freeMockCreatedToast"));
      setDraft(null);
      setImportResult(null);
      setPrice(0);
      setIsFree(false);
      setStartsAt("");
      setEndsAt("");
      setResultsPublishAt("");
      await loadTests({ force: true });
    } catch (error) {
      toast.error(t("publishNotFinishedToast"), { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setPublishing(false);
    }
  };

  const openAssignments = async (test: TestRow) => {
    if (!user) return;
    setAssigningTest(test);
    const { data: classRows } = await supabase
      .from("classes")
      .select("id,name")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false });
    const ownClasses = (classRows || []) as TeacherClass[];
    setClasses(ownClasses);
    if (ownClasses.length === 0) {
      setStudents([]);
      return;
    }
    const { data: memberships } = await supabase
      .from("class_members")
      .select("student_id,class_id")
      .in("class_id", ownClasses.map((row) => row.id));
    const studentIds = Array.from(new Set((memberships || []).map((row) => row.student_id as string)));
    const { data: studentRows } = studentIds.length
      ? await supabase.from("users").select("id,name,surname,shortid").in("id", studentIds)
      : { data: [] as Array<{ id: string; name: string; surname: string | null; shortid: string | null }> };
    const classMap = new Map(ownClasses.map((row) => [row.id, row.name]));
    const membershipMap = new Map((memberships || []).map((row) => [row.student_id as string, classMap.get(row.class_id as string) || ""]));
    setStudents((studentRows || []).map((row) => ({ ...row, className: membershipMap.get(row.id) || "" })));
  };

  const assign = async (targetType: "class" | "student", targetId: string) => {
    if (!assigningTest) return;
    const key = `${targetType}:${targetId}`;
    setAssigning(key);
    try {
      const response = await fetch(`/api/mock-tests/${assigningTest.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t("assignErrorGeneric"));
      toast.success(targetType === "class" ? t("assignedToClassToast") : t("assignedToStudentToast"));
    } catch (error) {
      toast.error(t("assignFailedToast"), { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setAssigning(null);
    }
  };

  // Admin-only: paid mocks have no equivalent of the teacher's class-summary
  // page, so the close/finalize controls the teacher gets there live here
  // instead, next to the same tests list.
  const toggleClose = async (test: TestRow) => {
    const closing = !test.closed_at;
    setTogglingClose(test.id);
    try {
      const { error } = await supabase.from("mock_tests").update({ closed_at: closing ? new Date().toISOString() : null }).eq("id", test.id);
      if (error) throw error;
      toast.success(closing ? t("mockClosedToast") : t("mockReopenedToast"));
      await loadTests({ force: true });
    } catch (error) {
      toast.error(t("toggleCloseFailed"), { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setTogglingClose(null);
    }
  };

  const finalizeResults = async (test: TestRow) => {
    setFinalizing(test.id);
    try {
      // Сначала письменные задания всей группы — пачками, один заход в модель
      // на пачку. Роут возобновляемый и возвращает `remaining`, поэтому просто
      // дёргаем его, пока непроверенные не закончатся. Балл за эссе должен
      // быть окончательным ДО публикации: перевзвешивание по сложности
      // считается уже по нему.
      let guard = 0;
      for (;;) {
        const gradeResponse = await fetch(`/api/mock-tests/${test.id}/grade-essays`, { method: "POST" });
        const gradeBody = await gradeResponse.json();
        if (!gradeResponse.ok) throw new Error(gradeBody.error || t("gradeEssaysFailed"));
        if (gradeBody.graded > 0) {
          toast.info(t("gradeEssaysProgress").replace("{graded}", String(gradeBody.graded)));
        }
        // Останавливаемся, когда проверять нечего, либо когда заход не сдвинул
        // счётчик — иначе при устойчивой ошибке модели цикл был бы бесконечным.
        if (!gradeBody.remaining || gradeBody.graded === 0 || ++guard >= 10) {
          if (gradeBody.remaining > 0) {
            toast.warning(t("gradeEssaysLeftover").replace("{count}", String(gradeBody.remaining)));
          }
          break;
        }
      }

      const response = await fetch(`/api/mock-tests/${test.id}/finalize-results`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t("finalizeResultsFailed"));
      toast.success(t("finalizeResultsSuccessToast"));
      if (Array.isArray(body.recalcErrors) && body.recalcErrors.length > 0) {
        toast.warning(t("recalcPartialWarning"), { description: body.recalcErrors.join("; ") });
      }
      await loadTests({ force: true });
    } catch (error) {
      toast.error(t("finalizeResultsFailed"), { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setFinalizing(null);
    }
  };

  // datetime-local работает в местном времени, а в базе лежит ISO в UTC.
  const toLocalInput = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openPublishAtEditor = (test: TestRow) => {
    setEditingPublishAt(test);
    setPublishAtDraft(toLocalInput(test.results_publish_at));
  };

  const savePublishAt = async (clear: boolean) => {
    if (!editingPublishAt) return;
    const test = editingPublishAt;
    // То же правило, что проверяет publish_imported_mock при создании: дата
    // публикации не может быть раньше начала теста.
    if (!clear && publishAtDraft && test.starts_at && new Date(publishAtDraft) < new Date(test.starts_at)) {
      toast.error(t("resultsBeforeStartPrompt"));
      return;
    }
    setSavingPublishAt(true);
    try {
      const value = clear || !publishAtDraft ? null : new Date(publishAtDraft).toISOString();
      const { error } = await supabase.from("mock_tests").update({ results_publish_at: value }).eq("id", test.id);
      if (error) throw error;
      toast.success(clear || !publishAtDraft ? t("publishAtClearedToast") : t("publishAtSavedToast"));
      setEditingPublishAt(null);
      await loadTests({ force: true });
    } catch (error) {
      toast.error(t("publishAtSaveFailed"), { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setSavingPublishAt(false);
    }
  };

  // Тип теста задавался ровно один раз, при публикации (publish_imported_mock
  // выводит его из роли), и поменять «платный ↔ бесплатный» после этого было
  // нечем. Пишем прямо в mock_tests: RLS mock_tests_admin — FOR ALL, отдельный
  // роут не нужен, тот же путь, что у toggleClose/savePublishAt.
  //
  // Цену при переводе в бесплатный НЕ обнуляем: с миграции 066 платность
  // определяет только `type` (can_access_mock на price больше не смотрит), а
  // сохранённая цена позволяет вернуть тест в платные, ничего не вводя заново.
  const openPricingEditor = (test: TestRow) => {
    setEditingPricing(test);
    setPricingFreeDraft(test.type === "free");
    setPricingPriceDraft(test.price);
  };

  const savePricing = async () => {
    if (!editingPricing) return;
    const test = editingPricing;
    if (!pricingFreeDraft && pricingPriceDraft <= 0) {
      toast.error(t("addPricePrompt"));
      return;
    }
    setSavingPricing(true);
    try {
      const { error } = await supabase
        .from("mock_tests")
        .update({ type: pricingFreeDraft ? "free" : "paid", price: pricingFreeDraft ? test.price : pricingPriceDraft })
        .eq("id", test.id);
      if (error) throw error;
      toast.success(pricingFreeDraft ? t("pricingNowFreeToast") : t("pricingNowPaidToast"));
      setEditingPricing(null);
      await loadTests({ force: true });
    } catch (error) {
      toast.error(t("pricingSaveFailed"), { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setSavingPricing(false);
    }
  };

  // ═══ Проверяющий письменных работ (миграция 080) ═══
  //
  // Назначается на конкретный тест, а не отдельной ролью: так семь предметов
  // расходятся по разным людям — узбекский проверяет один, английский другой.
  // Назначенный только ставит баллы; «Готово» по-прежнему за супер-админом,
  // и это гарантирует сама база, а не интерфейс.
  const openReviewerEditor = async (test: TestRow) => {
    setEditingReviewer(test);
    setReviewerDraft("");
    setReviewerLoading(true);
    try {
      const [candidates, current] = await Promise.all([
        fetchReviewerCandidates(),
        fetchMockReviewerId(test.id),
      ]);
      setReviewerCandidates(candidates);
      setReviewerDraft(current ?? "");
    } catch (error) {
      toast.error(t("reviewerLoadFailed"), { description: error instanceof Error ? error.message : String(error) });
      setEditingReviewer(null);
    } finally {
      setReviewerLoading(false);
    }
  };

  const saveReviewer = async () => {
    if (!editingReviewer || !user) return;
    setSavingReviewer(true);
    try {
      await setMockReviewer(editingReviewer.id, reviewerDraft || null, user.id);
      toast.success(reviewerDraft ? t("reviewerSavedToast") : t("reviewerClearedToast"));
      setEditingReviewer(null);
    } catch (error) {
      toast.error(t("reviewerSaveFailed"), { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setSavingReviewer(false);
    }
  };

  const itemCount = draft ? countResponseItems(draft) : 0;
  const missingKeys = useMemo(() => {
    if (!draft) return 0;
    return draft.sections.flatMap((section) => section.questions).filter((question) => question.answerOrigin === "missing" && !question.requiresManualReview).length;
  }, [draft]);
  const totalPoints = useMemo(() => {
    if (!draft) return 0;
    return sumPoints(draft.sections.flatMap((section) => section.questions).map((question) => question.points));
  }, [draft]);

  if (draft && importResult) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button onClick={() => { setDraft(null); setImportResult(null); }} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
              <ArrowLeft size={16} /> {t("backToList")}
            </button>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("reviewTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("reviewSubtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-border bg-muted px-3 py-1.5 font-semibold">{SUBJECT_LABELS[draft.subject]}</span>
            <span className="rounded-full border border-border bg-muted px-3 py-1.5 font-semibold">{t("answersCountLabel").replace("{count}", String(itemCount))}</span>
            {missingKeys > 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-800">{t("missingKeysLabel").replace("{count}", String(missingKeys))}</span>}
            {/* Сумма ни к чему не приводится, поэтому «правильного» значения у
                неё нет — тревожный цвет остаётся только для нулевой суммы,
                которую getPublicationIssues и так не пропустит. */}
            <span className={`rounded-full border px-3 py-1.5 font-semibold ${totalPoints > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              {t("pointsTotalLabel").replace("{total}", String(totalPoints))}
            </span>
          </div>
        </div>

        <div className="grid gap-5 xl:min-h-[760px] xl:grid-cols-[minmax(360px,0.85fr)_minmax(520px,1.15fr)]">
          {/* Below xl the two-pane layout stacks into one column — put the
              actual review form first so a reviewer on a phone/tablet isn't
              forced to scroll past a tall PDF preview before reaching it. */}
          <aside className="order-2 xl:sticky xl:top-0 xl:order-1 xl:h-[calc(100vh-170px)]">
            {importResult.sourcePdfPaths.length > 1 && (
              <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("previewShowsFirstOfN").replace("{count}", String(importResult.sourcePdfPaths.length))}</p>
            )}
            <div className="h-full overflow-hidden rounded-2xl border border-border bg-muted">
              <iframe title={t("sourcePdfTitle")} src={importResult.previewUrl} className="h-[360px] w-full xl:h-full xl:min-h-[640px]" />
            </div>
          </aside>

          <main className="order-1 space-y-5 xl:order-2">
            <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t("titleLabel")}
                  <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-base font-semibold text-foreground" />
                </label>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t("durationMinutesLabel")}
                  <input type="number" min={1} value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground" />
                </label>
                {mode === "admin" && oylikSets.length > 0 && (
                  <label className="sm:col-span-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("oylikSetLabel")}
                    <select
                      value={oylikSetId}
                      onChange={(event) => setOylikSetId(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-normal normal-case tracking-normal text-foreground"
                    >
                      <option value="">{t("oylikSetNone")}</option>
                      {oylikSets.map((set) => (
                        <option key={set.id} value={set.id}>{set.title}</option>
                      ))}
                    </select>
                    {oylikSetId && (
                      <span className="mt-2 block text-[11px] font-normal normal-case text-muted-foreground">{t("oylikSetHint")}</span>
                    )}
                  </label>
                )}
                {/* Тест комплекта не бывает платным: он раздаётся группам по
                    предмету, а не покупается. Поэтому весь блок платности для
                    него скрыт. */}
                {mode === "admin" && !oylikSetId && (
                  <div className="sm:col-span-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("pricingModeLabel")}</span>
                    <div className="mt-2 inline-flex w-full rounded-xl border border-border bg-muted p-1 sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setIsFree(false)}
                        className={`flex-1 rounded-lg px-5 py-2 text-sm font-bold transition-all sm:flex-none ${!isFree ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {t("pricingPaidOption")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsFree(true); setPrice(0); }}
                        className={`flex-1 rounded-lg px-5 py-2 text-sm font-bold transition-all sm:flex-none ${isFree ? "bg-card text-emerald-700 shadow-sm dark:text-emerald-400" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {t("pricingFreeOption")}
                      </button>
                    </div>
                    {isFree && (
                      <span className="mt-2 block text-[11px] font-normal normal-case text-muted-foreground">{t("pricingFreeHint")}</span>
                    )}
                  </div>
                )}
                {mode === "admin" && !isFree && !oylikSetId && (
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("priceUzsLabel")}
                    <input type="number" min={1} value={price || ""} onChange={(event) => setPrice(Number(event.target.value))} placeholder={t("pricePlaceholder")} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground" />
                  </label>
                )}
                {mode === "admin" && (
                  <>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {t("startsAtLabel")}
                      <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground" />
                      <span className="mt-1 block text-[11px] font-normal normal-case text-muted-foreground">{t("startsAtHint")}</span>
                    </label>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {t("endsAtLabel")}
                      <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground" />
                      <span className="mt-1 block text-[11px] font-normal normal-case text-muted-foreground">{t("endsAtHint")}</span>
                    </label>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {t("resultsPublishAtLabel")}
                      <input type="datetime-local" value={resultsPublishAt} onChange={(event) => setResultsPublishAt(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground" />
                      <span className="mt-1 block text-[11px] font-normal normal-case text-muted-foreground">{t("resultsPublishAtHint")}</span>
                    </label>
                  </>
                )}
              </div>
              {(draft.warnings.length > 0 || missingKeys > 0) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30">
                  <p className="flex items-center gap-2 font-bold"><AlertTriangle size={16} /> {t("reviewCarefully")}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                    {missingKeys > 0 && <li>{t("missingKeysWarning").replace("{count}", String(missingKeys))}</li>}
                  </ul>
                </div>
              )}
            </section>

            {draft.sections.map((section, sectionIndex) => (
              <section key={`${section.order}-${sectionIndex}`} className="space-y-3">
                <div className="flex items-center justify-between gap-3 px-1">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-primary">{section.kind}</p>
                    <h2 className="text-xl font-bold">{section.title}</h2>
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">{t("questionsCountLabel").replace("{count}", String(section.questions.length))}</span>
                </div>

                {section.questions.map((question, questionIndex) => (
                  <article key={`${question.number}-${questionIndex}`} className={`rounded-2xl border bg-card p-5 shadow-sm ${question.answerOrigin === "missing" && !question.requiresManualReview ? "border-amber-300" : "border-border"}`}>
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <input aria-label={t("questionNumberAria")} value={question.number} onChange={(event) => updateQuestion(sectionIndex, questionIndex, { number: event.target.value })} className="w-14 rounded-lg bg-primary px-2.5 py-1 text-center text-xs font-bold text-primary-foreground outline-none" />
                      <select value={question.type} onChange={(event) => updateQuestion(sectionIndex, questionIndex, { type: event.target.value as ImportedQuestion["type"] })} className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold">
                        {MOCK_QUESTION_TYPES.filter((type) => mode === "admin" || type !== "essay" || question.type === "essay").map((type) => <option key={type} value={type}>{QUESTION_LABELS[type]}</option>)}
                      </select>
                      <label className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
                        {t("pointsLabel")}
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={question.points}
                          onChange={(event) => updateQuestion(sectionIndex, questionIndex, { points: Number(event.target.value) })}
                          aria-label={t("pointsLabel")}
                          className="w-14 bg-transparent text-right text-foreground outline-none"
                        />
                      </label>
                      <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${question.confidence >= 0.85 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{t("aiConfidenceLabel").replace("{percent}", String(Math.round(question.confidence * 100)))}</span>
                      <span className="text-xs text-muted-foreground">
                        {importResult.sourcePdfPaths.length > 1
                          ? t("pageOfFileLabel").replace("{page}", String(question.sourcePage)).replace("{file}", String(question.sourceFileIndex + 1))
                          : t("pageLabel").replace("{page}", String(question.sourcePage))}
                      </span>
                      <button onClick={() => removeQuestion(sectionIndex, questionIndex)} className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600" aria-label={t("removeQuestionAria")}><Trash2 size={15} /></button>
                    </div>

                    {question.sharedStimulus && (
                      <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {t("sharedStimulusLabel")}
                        <textarea value={question.sharedStimulus} onChange={(event) => updateQuestion(sectionIndex, questionIndex, { sharedStimulus: event.target.value })} rows={3} className="mt-2 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground" />
                      </label>
                    )}
                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {t("promptLabel")}
                      <textarea value={question.prompt} onChange={(event) => updateQuestion(sectionIndex, questionIndex, { prompt: event.target.value })} rows={3} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground" />
                    </label>

                    {question.needsSourceImage && (
                      <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--brand-blue-soft))] px-3 py-2 text-xs font-semibold text-[hsl(var(--brand-blue-ink))]">
                        <Eye size={14} /> {t("sourceImageNotice")}
                      </p>
                    )}

                    {isChoiceQuestion(question) ? (
                      <div className="mt-4 space-y-2">
                        {question.options.map((option, optionIndex) => {
                          const checked = question.correctOptionIds.includes(option.id);
                          return (
                            <div key={`${option.id}-${optionIndex}`} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${checked ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20" : "border-border"}`}>
                              <button
                                onClick={() => {
                                  const multi = question.type === "multiple_choice";
                                  const next = multi
                                    ? checked ? question.correctOptionIds.filter((id) => id !== option.id) : [...question.correctOptionIds, option.id]
                                    : [option.id];
                                  updateQuestion(sectionIndex, questionIndex, { correctOptionIds: next, answerOrigin: "provided" });
                                }}
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-background"}`}
                                title={t("markCorrectAnswerTitle")}
                              >
                                {checked ? <Check size={14} /> : option.id.toUpperCase()}
                              </button>
                              <input value={option.text} onChange={(event) => {
                                const options = question.options.map((item, index) => index === optionIndex ? { ...item, text: event.target.value } : item);
                                updateQuestion(sectionIndex, questionIndex, { options });
                              }} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                            </div>
                          );
                        })}
                        <button onClick={() => {
                          const nextId = String.fromCharCode(97 + question.options.length);
                          updateQuestion(sectionIndex, questionIndex, { options: [...question.options, { id: nextId, text: "" }] });
                        }} className="rounded-xl border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted">{t("addOption")}</button>
                      </div>
                    ) : question.type !== "essay" ? (
                      <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {t("acceptedAnswersLabel")}
                        <textarea value={question.acceptedAnswers.join("\n")} onChange={(event) => updateQuestion(sectionIndex, questionIndex, { acceptedAnswers: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean), answerOrigin: "provided" })} rows={2} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground" />
                      </label>
                    ) : (
                      <p className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800 dark:bg-violet-950/30">{t("essayAutoGradedNotice")}</p>
                    )}

                    {question.reviewNote && <p className="mt-3 text-xs text-muted-foreground">{t("aiCommentLabel").replace("{note}", question.reviewNote)}</p>}
                  </article>
                ))}
                <button onClick={() => addQuestion(sectionIndex)} className="w-full rounded-xl border border-dashed border-border px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted">{t("addMissingQuestion")}</button>
              </section>
            ))}

            <button onClick={addSection} className="w-full rounded-2xl border border-dashed border-border px-5 py-4 text-sm font-bold text-muted-foreground hover:bg-muted">{t("addSection")}</button>

            {publishIssues.length > 0 && (
              <div id="studio-issues" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 dark:bg-red-950/30">
                <p className="font-bold">{t("fixBeforePublish")}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">{publishIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
              </div>
            )}

            <div className="sticky bottom-3 z-20 flex items-center justify-between gap-4 rounded-2xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{draft.title}</p>
                <p className="text-xs text-muted-foreground">{t("responseFieldsCount").replace("{count}", String(itemCount))} · {draft.durationMinutes} {t("minutesSuffix")}</p>
              </div>
              <button onClick={publish} disabled={publishing} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                {publishing ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
                {publishing ? t("publishing") : t("reviewedReady")}
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{mode === "admin" ? t("superAdminBadge") : t("teacherWorkspaceBadge")}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{mode === "admin" ? t("paidMocksTitle") : t("freeMocksTitle")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {t("uploadSubtitle")}
          </p>
        </div>
        {pendingTests.length === 0 && (
          <button onClick={() => inputRef.current?.click()} disabled={importing} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            <UploadCloud size={18} /> {t("uploadPdf")}
          </button>
        )}
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(event) => { addTestFiles(event.target.files); event.target.value = ""; }} />
        <input ref={answersInputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => selectAnswers(event.target.files?.[0])} />
      </header>

      {pendingTests.length === 0 ? (
        <button
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); addTestFiles(event.dataTransfer.files); }}
          className={`group flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:border-primary/40 hover:bg-primary/5"}`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><FileText size={22} /></span>
          <span className="mt-4 font-bold">{t("dropPdfHere")}</span>
          <span className="mt-1 text-sm text-muted-foreground">{t("uploadHint")}</span>
          <span className="mt-1 text-xs text-muted-foreground">{t("multiPartHint").replace("{max}", String(MAX_TEST_FILES))}</span>
        </button>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-6">
          <p className="text-sm font-bold text-primary">{t("readyToRecognize")}</p>
          <div className="mt-4 space-y-2">
            {pendingTests.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileText size={18} className="shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{pendingTests.length > 1 ? t("testPartNote").replace("{number}", String(index + 1)) : t("testFileNote")}</p>
                  </div>
                </div>
                <button onClick={() => removeTestFile(index)} disabled={importing} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50" aria-label={t("removeTestFileAria")}><X size={16} /></button>
              </div>
            ))}
          </div>

          {pendingTests.length < MAX_TEST_FILES && (
            <button onClick={() => inputRef.current?.click()} disabled={importing} className="mt-3 w-full rounded-xl border border-dashed border-border px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
              {t("addAnotherTestPart")}
            </button>
          )}

          {pendingAnswers ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileText size={18} className="shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{pendingAnswers.name}</p>
                  <p className="text-xs text-muted-foreground">{t("answersFileNote")}</p>
                </div>
              </div>
              <button onClick={() => setPendingAnswers(null)} disabled={importing} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50" aria-label={t("removeAnswersFileAria")}><X size={16} /></button>
            </div>
          ) : (
            <button onClick={() => answersInputRef.current?.click()} disabled={importing} className="mt-3 w-full rounded-xl border border-dashed border-border px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
              {t("addAnswersFile")}
            </button>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={runImport} disabled={importing} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
              {importing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {importing ? t("geminiRecognizing") : t("recognizeTest")}
            </button>
            {/* Во время распознавания кнопка не просто активна, но и выглядит
                активной: раньше она была disabled и читалась как замороженная,
                хотя прервать бесполезное ожидание — самое нужное действие
                именно в этот момент. */}
            <button
              onClick={importing ? cancelImport : cancelPending}
              className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                importing
                  ? "border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:hover:bg-red-950/30"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {importing ? t("cancelImport") : t("cancel")}
            </button>
          </div>
          {importing && (
            <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              <Loader2 size={16} className="animate-spin" /> {t("analyzingPagesNotice")}
              <span className="font-normal text-muted-foreground">{t("canCancelAnytime")}</span>
            </p>
          )}
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("createdTestsTitle")}</h2>
          <span className="text-xs text-muted-foreground">{t("totalCountLabel").replace("{count}", String(tests.length))}</span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {/* Табличная раскладка включается только с lg. На md (планшет в
              портрете, 768px) шесть колонок в сумме давали ~800px плюс блок
              действий с пятью кнопками — при overflow-hidden у контейнера
              кнопки просто обрезались и до них было не дотянуться.
              Колонка автора убрана из сетки: это второстепенные данные, они
              переехали в подпись под названием и освободили место действиям. */}
          <div className="hidden grid-cols-[minmax(200px,1.6fr)_130px_90px_120px_auto] gap-4 border-b border-border bg-muted/50 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground lg:grid">
            <span>{t("columnTitle")}</span><span>{t("columnSubject")}</span><span>{t("columnQuestions")}</span><span>{mode === "admin" ? t("columnPrice") : t("columnDuration")}</span><span />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : tests.length === 0 ? (
            <div className="py-16 text-center"><FileText className="mx-auto text-muted-foreground/40" /><p className="mt-3 font-semibold text-muted-foreground">{t("noTestsYet")}</p></div>
          ) : tests.map((test) => (
            <div key={test.id} className="grid gap-3 border-b border-border px-4 py-4 last:border-0 sm:px-5 lg:grid-cols-[minmax(200px,1.6fr)_130px_90px_120px_auto] lg:items-center lg:gap-4">
              <div className="min-w-0">
                <p className="font-semibold lg:truncate">{test.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(test.created_at).toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ")} · {test.status}
                  {Boolean(test.closed_at) && ` · ${t("closedLabel")}`}
                  <span className="lg:hidden"> · {test.creator_name}</span>
                </p>
                <span className="mt-1 hidden text-xs text-muted-foreground lg:block">{test.creator_name}</span>
              </div>
              {/* До lg предмет, число вопросов и цена идут одной переносимой
                  строкой, а не тремя подписанными блоками: на телефоне так
                  экономится три строки высоты на каждый тест. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground lg:block lg:text-inherit">
                <span className="lg:hidden text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{t("columnSubject")}</span>
                <span>{SUBJECT_LABELS[test.subject_id || "other"] || test.subject_id || "—"}</span>
                <span className="lg:hidden" aria-hidden="true">·</span>
                <span className="font-semibold tabular-nums lg:hidden">{test.question_count} {t("columnQuestions").toLowerCase()}</span>
                <span className="lg:hidden" aria-hidden="true">·</span>
                <span className="font-semibold lg:hidden">
                  {mode !== "admin"
                    ? `${test.duration_minutes} ${t("minutesSuffix")}`
                    : test.price > 0
                      ? formatMoney(test.price, locale, t("currencySumSuffix"))
                      : <span className="text-emerald-700 dark:text-emerald-400">{t("freeColumnValue")}</span>}
                </span>
              </div>
              <div className="hidden text-sm font-semibold tabular-nums lg:block">{test.question_count}</div>
              <div className="hidden text-sm font-semibold lg:block">
                {/* По типу, а не по цене: бесплатный тест сохраняет прежнюю
                    цену в колонке, чтобы его можно было вернуть в платные. */}
                {mode !== "admin"
                  ? `${test.duration_minutes} ${t("minutesSuffix")}`
                  : test.type === "free"
                    ? <span className="text-emerald-700 dark:text-emerald-400">{t("freeColumnValue")}</span>
                    : formatMoney(test.price, locale, t("currencySumSuffix"))}
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Link href={`/mock/${test.id}?preview=1`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted" title={t("previewTitle")}><Eye size={16} /></Link>
                {mode === "teacher" && <button onClick={() => openAssignments(test)} title={t("assignAction")} aria-label={t("assignAction")} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><Send size={14} /> <span className="hidden xl:inline">{t("assignAction")}</span></button>}
                {test.completed_count > 0 && (
                  <span className="inline-flex items-center px-1 text-xs font-semibold text-muted-foreground">
                    {t("completedCountShort").replace("{count}", String(test.completed_count))}
                  </span>
                )}
                {/* Результаты и ручная проверка эссе. Для админского мока это
                    единственный путь: он не привязан к классу, поэтому экран
                    результатов класса для него недоступен. */}
                {mode === "admin" && test.completed_count > 0 && (
                  <Link
                    href={`/admin/mock-tests/${test.id}/results`}
                    title={t("openResultsAction")}
                    aria-label={t("openResultsAction")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-semibold hover:bg-muted"
                  >
                    <ListChecks size={13} /> <span className="hidden xl:inline">{t("openResultsAction")}</span>
                  </Link>
                )}
                {/* Кто проверяет письменные работы этого теста. Супер-админ
                    этим заниматься не должен, а у бесплатного мока нет ни
                    класса, ни назначений, за которые мог бы зацепиться
                    учитель — отсюда явное назначение (миграция 080). */}
                {mode === "admin" && (
                  <button
                    onClick={() => openReviewerEditor(test)}
                    title={t("reviewerAction")}
                    aria-label={t("reviewerAction")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-semibold hover:bg-muted"
                  >
                    <ClipboardCheck size={13} /> <span className="hidden xl:inline">{t("reviewerAction")}</span>
                  </button>
                )}
                {mode === "admin" && (
                  <button
                    onClick={() => openPricingEditor(test)}
                    title={t("pricingAction")}
                    aria-label={t("pricingAction")}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${
                      test.type === "free"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <Wallet size={13} />
                    <span className="hidden xl:inline">{test.type === "free" ? t("pricingFreeOption") : t("pricingPaidOption")}</span>
                  </button>
                )}
                {mode === "admin" && (
                  <button
                    onClick={() => openPublishAtEditor(test)}
                    title={t("publishAtAction")}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${
                      test.results_publish_at && new Date(test.results_publish_at) > new Date()
                        ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <CalendarClock size={13} />
                    {/* Назначенную дату показываем всегда — это предупреждение,
                        из-за которого публикация откажет. Общую подпись без
                        даты прячем до xl, чтобы не раздувать строку. */}
                    {test.results_publish_at && new Date(test.results_publish_at) > new Date()
                      ? <span>{new Date(test.results_publish_at).toLocaleString(locale === "uz" ? "uz-UZ" : "ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                      : <span className="hidden xl:inline">{t("publishAtAction")}</span>}
                  </button>
                )}
                {Boolean(test.closed_at) && test.completed_count > 0 && (
                  <button
                    onClick={() => finalizeResults(test)}
                    disabled={finalizing === test.id}
                    title={t("finalizeResultsAction")}
                    aria-label={t("finalizeResultsAction")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400"
                  >
                    <CheckCircle2 size={13} />
                    {/* Идёт публикация — показываем всегда: это единственный
                        признак, что нажатие сработало и процесс идёт. */}
                    {finalizing === test.id
                      ? <span>{t("finalizingLabel")}</span>
                      : <span className="hidden xl:inline">{t("finalizeResultsAction")}</span>}
                  </button>
                )}
                <button
                  onClick={() => toggleClose(test)}
                  disabled={togglingClose === test.id}
                  title={test.closed_at ? t("reopenMock") : t("closeMock")}
                  aria-label={test.closed_at ? t("reopenMock") : t("closeMock")}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${test.closed_at ? "border-border hover:bg-muted" : "border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"}`}
                >
                  {test.closed_at ? <LockOpen size={13} /> : <Lock size={13} />}
                  {togglingClose === test.id
                    ? <span>{t("togglingLabel")}</span>
                    : <span className="hidden xl:inline">{test.closed_at ? t("reopenMock") : t("closeMock")}</span>}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {editingPublishAt && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={() => setEditingPublishAt(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-background shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-border p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary">{t("publishAtTitle")}</p>
                <h2 className="mt-1 text-lg font-bold">{editingPublishAt.title}</h2>
              </div>
              <button onClick={() => setEditingPublishAt(null)} className="rounded-xl p-2 hover:bg-muted"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("resultsPublishAtLabel")}
                <input
                  type="datetime-local"
                  value={publishAtDraft}
                  onChange={(event) => setPublishAtDraft(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground"
                />
              </label>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t("publishAtHint")}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => savePublishAt(false)}
                  disabled={savingPublishAt}
                  className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  {savingPublishAt ? t("publishAtSavingLabel") : t("publishAtSaveAction")}
                </button>
                <button
                  onClick={() => savePublishAt(true)}
                  disabled={savingPublishAt || !editingPublishAt.results_publish_at}
                  className="rounded-xl border border-border px-4 py-3 text-sm font-semibold hover:bg-muted disabled:opacity-40"
                >
                  {t("publishAtClearAction")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingPricing && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={() => setEditingPricing(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-background shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-border p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary">{t("pricingTitle")}</p>
                <h2 className="mt-1 text-lg font-bold">{editingPricing.title}</h2>
              </div>
              <button onClick={() => setEditingPricing(null)} className="rounded-xl p-2 hover:bg-muted"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-6">
              <div className="flex gap-2 rounded-xl bg-muted p-1">
                <button
                  onClick={() => setPricingFreeDraft(false)}
                  className={`flex-1 rounded-lg px-5 py-2 text-sm font-bold transition-all ${!pricingFreeDraft ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t("pricingPaidOption")}
                </button>
                <button
                  onClick={() => setPricingFreeDraft(true)}
                  className={`flex-1 rounded-lg px-5 py-2 text-sm font-bold transition-all ${pricingFreeDraft ? "bg-card text-emerald-700 shadow-sm dark:text-emerald-400" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t("pricingFreeOption")}
                </button>
              </div>
              {!pricingFreeDraft && (
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t("priceUzsLabel")}
                  <input
                    type="number"
                    min={0}
                    value={pricingPriceDraft}
                    onChange={(event) => setPricingPriceDraft(Number(event.target.value))}
                    className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground"
                  />
                </label>
              )}
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t("pricingHint")}</p>
              <button
                onClick={savePricing}
                disabled={savingPricing}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {savingPricing ? t("publishAtSavingLabel") : t("publishAtSaveAction")}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingReviewer && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={() => setEditingReviewer(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-background shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-border p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary">{t("reviewerTitle")}</p>
                <h2 className="mt-1 text-lg font-bold">{editingReviewer.title}</h2>
              </div>
              <button onClick={() => setEditingReviewer(null)} className="rounded-xl p-2 hover:bg-muted"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-6">
              {reviewerLoading ? (
                <div className="h-12 animate-pulse rounded-xl bg-muted" />
              ) : (
                <select
                  value={reviewerDraft}
                  onChange={(event) => setReviewerDraft(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground"
                >
                  <option value="">{t("reviewerNone")}</option>
                  {reviewerCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                  ))}
                </select>
              )}
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t("reviewerHint")}</p>
              <button
                onClick={saveReviewer}
                disabled={savingReviewer || reviewerLoading}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {savingReviewer ? t("publishAtSavingLabel") : t("publishAtSaveAction")}
              </button>
            </div>
          </div>
        </div>
      )}

      {assigningTest && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={() => setAssigningTest(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-background shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-border p-6">
              <div><p className="text-xs font-bold uppercase tracking-wider text-primary">{t("assignMockTitle")}</p><h2 className="mt-1 text-xl font-bold">{assigningTest.title}</h2></div>
              <button onClick={() => setAssigningTest(null)} className="rounded-xl p-2 hover:bg-muted"><X size={18} /></button>
            </div>
            <div className="max-h-[65vh] space-y-6 overflow-y-auto p-6">
              <div>
                <h3 className="flex items-center gap-2 font-bold"><Users size={17} /> {t("wholeClassLabel")}</h3>
                <div className="mt-3 space-y-2">
                  {classes.length === 0 ? <p className="text-sm text-muted-foreground">{t("createClassFirst")}</p> : classes.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3"><span className="font-medium">{item.name}</span><button onClick={() => assign("class", item.id)} disabled={assigning === `class:${item.id}`} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">{assigning === `class:${item.id}` ? t("assigningLabel") : t("assignToAll")}</button></div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-bold">{t("selectedStudentLabel")}</h3>
                <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {students.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{t("noStudentsInClassesYet")}</p> : students.map((student) => (
                    <div key={student.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{student.name} {student.surname || ""}</p><p className="text-xs text-muted-foreground">{student.className} · {t("idLabel").replace("{id}", student.shortid || "—")}</p></div><button onClick={() => assign("student", student.id)} disabled={assigning === `student:${student.id}`} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50">{assigning === `student:${student.id}` ? t("assigningEllipsis") : t("assignAction")}</button></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
