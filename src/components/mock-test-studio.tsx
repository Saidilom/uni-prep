"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Eye,
  FileText,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
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
};

type TeacherClass = { id: string; name: string };
type StudentTarget = { id: string; name: string; surname: string | null; shortid: string | null; className: string };

const SUBJECT_LABELS: Record<string, string> = {
  math: "Математика",
  physics: "Физика",
  chemistry: "Химия",
  biology: "Биология",
  geography: "География",
  history: "История",
  english: "Английский",
  russian: "Русский язык",
  uzbek: "Узбекский язык",
  it: "Информатика",
  other: "Другой предмет",
};

const QUESTION_LABELS: Record<string, string> = {
  single_choice: "Один вариант",
  multiple_choice: "Несколько вариантов",
  true_false: "Верно / неверно",
  short_text: "Короткий текст",
  numeric: "Число",
  math_expression: "Формула / выражение",
  matching: "Соответствие",
  ordering: "Порядок",
  table_completion: "Заполнение таблицы",
  essay: "Развёрнутый ответ",
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value) + " сум";
}

function isChoiceQuestion(question: ImportedQuestion) {
  return ["single_choice", "multiple_choice", "true_false", "matching"].includes(question.type);
}

function emptyQuestion(order: number): ImportedQuestion {
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
    needsSourceImage: false,
    requiresManualReview: false,
    confidence: 1,
    reviewNote: "Добавлено вручную",
    rubricNote: null,
  };
}

export default function MockTestStudio({ mode }: { mode: StudioMode }) {
  const { user } = useAuthStore();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const answersInputRef = useRef<HTMLInputElement>(null);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [pendingTest, setPendingTest] = useState<File | null>(null);
  const [pendingAnswers, setPendingAnswers] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<MockImportResponse | null>(null);
  const [draft, setDraft] = useState<ImportedMock | null>(null);
  const [price, setPrice] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);
  const [assigningTest, setAssigningTest] = useState<TestRow | null>(null);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [students, setStudents] = useState<StudentTarget[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  // The reviewed-but-unpublished draft must survive an accidental page reload
  // (dev-server hot reload, browser refresh, tab restore) — losing a fully
  // recognized test because of that felt like a "reset" to the user even
  // though no button was pressed. Persisted only for the post-recognition
  // review stage: pendingTest/pendingAnswers are raw File objects and can't
  // be serialized, so a reload before "Распознать тест" still needs re-attaching.
  const draftStorageKey = `mock-import-draft:${mode}`;
  const skipNextPersist = useRef(true);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftStorageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { draft: ImportedMock; importResult: MockImportResponse; price: number };
        if (saved?.draft && saved?.importResult) {
          setDraft(saved.draft);
          setImportResult(saved.importResult);
          if (typeof saved.price === "number") setPrice(saved.price);
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
        sessionStorage.setItem(draftStorageKey, JSON.stringify({ draft, importResult, price }));
      } else {
        sessionStorage.removeItem(draftStorageKey);
      }
    } catch {
      // storage full/unavailable — recognized draft still works, just won't survive a reload
    }
  }, [draft, importResult, price, draftStorageKey]);

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
        if (!response.ok) throw new Error(body.error || "Не удалось загрузить тесты");
        return (body.tests || []) as TestRow[];
      }, 60 * 1000);
      setTests(tests);
    } catch (error) {
      toast.error("Не удалось загрузить Mock-тесты", { description: String(error) });
    } finally {
      setLoading(false);
    }
  }, [toast, mode]);

  useEffect(() => { loadTests(); }, [loadTests]);

  const selectTest = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Нужен PDF-файл");
      return;
    }
    setPendingTest(file);
  };

  const selectAnswers = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Нужен PDF-файл");
      return;
    }
    setPendingAnswers(file);
  };

  const uploadStoredFile = async (file: File, importId: string | undefined, kind: "test" | "answers") => {
    const uploadInit = await fetch("/api/mock-tests/import/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, size: file.size, importId, kind }),
    });
    const uploadData = await uploadInit.json();
    if (!uploadInit.ok) throw new Error(uploadData.error || "Не удалось подготовить загрузку");
    const { error: directUploadError } = await supabase.storage
      .from("test-imports")
      .uploadToSignedUrl(uploadData.path, uploadData.token, file, { contentType: "application/pdf" });
    if (directUploadError) throw directUploadError;
    return { importId: uploadData.importId as string, path: uploadData.path as string, filename: file.name, size: file.size };
  };

  const runImport = async () => {
    if (!pendingTest) return;
    setImporting(true);
    setPublishIssues([]);
    try {
      const testFile = await uploadStoredFile(pendingTest, undefined, "test");
      const answersFile = pendingAnswers ? await uploadStoredFile(pendingAnswers, testFile.importId, "answers") : undefined;
      const response = await fetch("/api/mock-tests/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId: testFile.importId, testFile, answersFile }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Ошибка импорта");
      setImportResult(body as MockImportResponse);
      setDraft((body as MockImportResponse).draft);
      setPendingTest(null);
      setPendingAnswers(null);
      toast.success("PDF распознан", { description: "Проверьте задания и ключи перед публикацией." });
    } catch (error) {
      toast.error("Gemini не смог обработать PDF", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
      if (answersInputRef.current) answersInputRef.current.value = "";
    }
  };

  const cancelPending = () => {
    setPendingTest(null);
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

  const removeQuestion = (sectionIndex: number, questionIndex: number) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: current.sections.map((section, sIndex) =>
          sIndex === sectionIndex
            ? { ...section, questions: section.questions.filter((_, qIndex) => qIndex !== questionIndex) }
            : section,
        ),
      };
    });
  };

  const addQuestion = (sectionIndex: number) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: current.sections.map((section, index) => index === sectionIndex
          ? { ...section, questions: [...section.questions, emptyQuestion(section.questions.length)] }
          : section),
      };
    });
  };

  const addSection = () => {
    setDraft((current) => {
      if (!current) return current;
      const section: ImportedSection = {
        title: `Раздел ${current.sections.length + 1}`,
        kind: "general",
        instructions: "",
        order: current.sections.length,
        questions: [emptyQuestion(0)],
      };
      return { ...current, sections: [...current.sections, section] };
    });
  };

  const publish = async () => {
    if (!draft || !importResult) return;
    const issues = getPublicationIssues(draft);
    if (mode === "admin" && price <= 0) issues.unshift("Укажите цену платного Mock-теста");
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
          sourcePdfPath: importResult.sourcePdfPath,
          price: mode === "admin" ? price : 0,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (Array.isArray(body.issues)) setPublishIssues(body.issues);
        throw new Error(body.error || "Не удалось опубликовать Mock");
      }
      toast.success(mode === "admin" ? "Платный Mock опубликован" : "Бесплатный Mock создан");
      setDraft(null);
      setImportResult(null);
      setPrice(0);
      await loadTests({ force: true });
    } catch (error) {
      toast.error("Публикация не завершена", { description: error instanceof Error ? error.message : String(error) });
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
      if (!response.ok) throw new Error(body.error || "Ошибка назначения");
      toast.success(targetType === "class" ? "Mock назначен всей группе" : "Mock назначен ученику");
    } catch (error) {
      toast.error("Не удалось назначить", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setAssigning(null);
    }
  };

  const itemCount = draft ? countResponseItems(draft) : 0;
  const missingKeys = useMemo(() => {
    if (!draft) return 0;
    return draft.sections.flatMap((section) => section.questions).filter((question) => question.answerOrigin === "missing" && !question.requiresManualReview).length;
  }, [draft]);

  if (draft && importResult) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button onClick={() => { setDraft(null); setImportResult(null); }} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
              <ArrowLeft size={16} /> К списку
            </button>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Проверка распознанного теста</h1>
            <p className="mt-2 text-sm text-muted-foreground">PDF слева, все задания одной прокруткой справа.</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full border border-border bg-muted px-3 py-1.5 font-semibold">{SUBJECT_LABELS[draft.subject]}</span>
            <span className="rounded-full border border-border bg-muted px-3 py-1.5 font-semibold">{itemCount} ответов</span>
            {missingKeys > 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-800">Без ключа: {missingKeys}</span>}
          </div>
        </div>

        <div className="grid min-h-[760px] gap-5 xl:grid-cols-[minmax(360px,0.85fr)_minmax(520px,1.15fr)]">
          <aside className="xl:sticky xl:top-0 xl:h-[calc(100vh-170px)]">
            <div className="h-full overflow-hidden rounded-2xl border border-border bg-muted">
              <iframe title="Исходный PDF" src={importResult.previewUrl} className="h-full min-h-[640px] w-full" />
            </div>
          </aside>

          <main className="space-y-5">
            <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Название
                  <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-base font-semibold text-foreground" />
                </label>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Длительность, минут
                  <input type="number" min={1} value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground" />
                </label>
                {mode === "admin" && (
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Цена, UZS
                    <input type="number" min={1} value={price || ""} onChange={(event) => setPrice(Number(event.target.value))} placeholder="Например, 50000" className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground" />
                  </label>
                )}
              </div>
              {(draft.warnings.length > 0 || missingKeys > 0) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30">
                  <p className="flex items-center gap-2 font-bold"><AlertTriangle size={16} /> Проверьте внимательно</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                    {missingKeys > 0 && <li>{missingKeys} автоматических заданий не имеют ключа ответа.</li>}
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
                  <span className="text-xs font-semibold text-muted-foreground">{section.questions.length} заданий</span>
                </div>

                {section.questions.map((question, questionIndex) => (
                  <article key={`${question.number}-${questionIndex}`} className={`rounded-2xl border bg-card p-5 shadow-sm ${question.answerOrigin === "missing" && !question.requiresManualReview ? "border-amber-300" : "border-border"}`}>
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <input aria-label="Номер задания" value={question.number} onChange={(event) => updateQuestion(sectionIndex, questionIndex, { number: event.target.value })} className="w-14 rounded-lg bg-primary px-2.5 py-1 text-center text-xs font-bold text-primary-foreground outline-none" />
                      <select value={question.type} onChange={(event) => updateQuestion(sectionIndex, questionIndex, { type: event.target.value as ImportedQuestion["type"] })} className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold">
                        {MOCK_QUESTION_TYPES.map((type) => <option key={type} value={type}>{QUESTION_LABELS[type]}</option>)}
                      </select>
                      <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${question.confidence >= 0.85 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>AI {Math.round(question.confidence * 100)}%</span>
                      <span className="text-xs text-muted-foreground">стр. {question.sourcePage}</span>
                      <button onClick={() => removeQuestion(sectionIndex, questionIndex)} className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600" aria-label="Удалить задание"><Trash2 size={15} /></button>
                    </div>

                    {question.sharedStimulus && (
                      <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Общий текст / условие
                        <textarea value={question.sharedStimulus} onChange={(event) => updateQuestion(sectionIndex, questionIndex, { sharedStimulus: event.target.value })} rows={3} className="mt-2 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground" />
                      </label>
                    )}
                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Задание
                      <textarea value={question.prompt} onChange={(event) => updateQuestion(sectionIndex, questionIndex, { prompt: event.target.value })} rows={3} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground" />
                    </label>

                    {question.needsSourceImage && (
                      <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--brand-blue-soft))] px-3 py-2 text-xs font-semibold text-[hsl(var(--brand-blue-ink))]">
                        <Eye size={14} /> В задании будет показана исходная страница с рисунком
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
                                title="Отметить правильный ответ"
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
                        }} className="rounded-xl border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted">+ Добавить вариант</button>
                      </div>
                    ) : question.type !== "essay" ? (
                      <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Допустимые ответы — каждый с новой строки
                        <textarea value={question.acceptedAnswers.join("\n")} onChange={(event) => updateQuestion(sectionIndex, questionIndex, { acceptedAnswers: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean), answerOrigin: "provided" })} rows={2} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground" />
                      </label>
                    ) : (
                      <p className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800 dark:bg-violet-950/30">Развёрнутый ответ будет автоматически оценён ИИ по официальному критерию сразу после сдачи теста. Учитель увидит оценку и сможет её поправить.</p>
                    )}

                    {question.reviewNote && <p className="mt-3 text-xs text-muted-foreground">Комментарий AI: {question.reviewNote}</p>}
                  </article>
                ))}
                <button onClick={() => addQuestion(sectionIndex)} className="w-full rounded-xl border border-dashed border-border px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted">+ Добавить пропущенное задание</button>
              </section>
            ))}

            <button onClick={addSection} className="w-full rounded-2xl border border-dashed border-border px-5 py-4 text-sm font-bold text-muted-foreground hover:bg-muted">+ Добавить раздел</button>

            {publishIssues.length > 0 && (
              <div id="studio-issues" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 dark:bg-red-950/30">
                <p className="font-bold">Перед публикацией исправьте:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">{publishIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
              </div>
            )}

            <div className="sticky bottom-3 z-20 flex items-center justify-between gap-4 rounded-2xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{draft.title}</p>
                <p className="text-xs text-muted-foreground">{itemCount} полей ответа · {draft.durationMinutes} мин</p>
              </div>
              <button onClick={publish} disabled={publishing} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                {publishing ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
                {publishing ? "Публикация…" : "Проверено — готово"}
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
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{mode === "admin" ? "Super Admin" : "Teacher workspace"}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{mode === "admin" ? "Платные Mock-тесты" : "Мои бесплатные Mock-тесты"}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Загрузите настоящий PDF. Gemini определит предмет и структуру, заполнит задания и оставит вам только проверку.
          </p>
        </div>
        {!pendingTest && (
          <button onClick={() => inputRef.current?.click()} disabled={importing} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            <UploadCloud size={18} /> Загрузить PDF
          </button>
        )}
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => selectTest(event.target.files?.[0])} />
        <input ref={answersInputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => selectAnswers(event.target.files?.[0])} />
      </header>

      {!pendingTest ? (
        <button
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); selectTest(event.dataTransfer.files?.[0]); }}
          className={`group flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:border-primary/40 hover:bg-primary/5"}`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><FileText size={22} /></span>
          <span className="mt-4 font-bold">Перетащите PDF сюда</span>
          <span className="mt-1 text-sm text-muted-foreground">До 32 MB · формулы, таблицы, графики и изображения поддерживаются</span>
        </button>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-6">
          <p className="text-sm font-bold text-primary">Готово к распознаванию</p>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <FileText size={18} className="shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{pendingTest.name}</p>
                <p className="text-xs text-muted-foreground">Тест — вопросы и задания</p>
              </div>
            </div>
            <button onClick={() => setPendingTest(null)} disabled={importing} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50" aria-label="Убрать файл теста"><X size={16} /></button>
          </div>

          {pendingAnswers ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileText size={18} className="shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{pendingAnswers.name}</p>
                  <p className="text-xs text-muted-foreground">Ответы — ключ будет сопоставлен по номерам</p>
                </div>
              </div>
              <button onClick={() => setPendingAnswers(null)} disabled={importing} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50" aria-label="Убрать файл ответов"><X size={16} /></button>
            </div>
          ) : (
            <button onClick={() => answersInputRef.current?.click()} disabled={importing} className="mt-3 w-full rounded-xl border border-dashed border-border px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
              + Добавить файл с ответами (необязательно)
            </button>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button onClick={runImport} disabled={importing} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
              {importing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {importing ? "Gemini распознаёт…" : "Распознать тест"}
            </button>
            <button onClick={cancelPending} disabled={importing} className="rounded-xl px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">Отмена</button>
          </div>
          {importing && <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary"><Loader2 size={16} className="animate-spin" /> Анализ страниц может занять несколько минут</p>}
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Созданные тесты</h2>
          <span className="text-xs text-muted-foreground">{tests.length} всего</span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(220px,1.5fr)_140px_100px_120px_minmax(140px,1fr)_auto] gap-4 border-b border-border bg-muted/50 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:grid">
            <span>Название</span><span>Предмет</span><span>Заданий</span><span>{mode === "admin" ? "Цена" : "Длительность"}</span><span>Автор</span><span />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : tests.length === 0 ? (
            <div className="py-16 text-center"><FileText className="mx-auto text-muted-foreground/40" /><p className="mt-3 font-semibold text-muted-foreground">Пока нет тестов</p></div>
          ) : tests.map((test) => (
            <div key={test.id} className="grid gap-3 border-b border-border px-5 py-4 last:border-0 md:grid-cols-[minmax(220px,1.5fr)_140px_100px_120px_minmax(140px,1fr)_auto] md:items-center md:gap-4">
              <div className="min-w-0"><p className="truncate font-semibold">{test.title}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(test.created_at).toLocaleDateString("ru-RU")} · {test.status}</p></div>
              <span className="text-sm text-muted-foreground">{SUBJECT_LABELS[test.subject_id || "other"] || test.subject_id || "—"}</span>
              <span className="text-sm font-semibold tabular-nums">{test.question_count}</span>
              <span className="text-sm font-semibold">{mode === "admin" ? formatMoney(test.price) : `${test.duration_minutes} мин`}</span>
              <span className="truncate text-sm text-muted-foreground">{test.creator_name}</span>
              <div className="flex justify-end gap-2">
                <Link href={`/mock/${test.id}?preview=1`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted" title="Предпросмотр"><Eye size={16} /></Link>
                {mode === "teacher" && <button onClick={() => openAssignments(test)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><Send size={14} /> Назначить</button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {assigningTest && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={() => setAssigningTest(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-background shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-border p-6">
              <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Назначение Mock</p><h2 className="mt-1 text-xl font-bold">{assigningTest.title}</h2></div>
              <button onClick={() => setAssigningTest(null)} className="rounded-xl p-2 hover:bg-muted"><X size={18} /></button>
            </div>
            <div className="max-h-[65vh] space-y-6 overflow-y-auto p-6">
              <div>
                <h3 className="flex items-center gap-2 font-bold"><Users size={17} /> Вся группа</h3>
                <div className="mt-3 space-y-2">
                  {classes.length === 0 ? <p className="text-sm text-muted-foreground">Сначала создайте группу.</p> : classes.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3"><span className="font-medium">{item.name}</span><button onClick={() => assign("class", item.id)} disabled={assigning === `class:${item.id}`} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">{assigning === `class:${item.id}` ? "Назначение…" : "Назначить всем"}</button></div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-bold">Выбранный ученик</h3>
                <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {students.length === 0 ? <p className="p-4 text-sm text-muted-foreground">В ваших группах пока нет учеников.</p> : students.map((student) => (
                    <div key={student.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{student.name} {student.surname || ""}</p><p className="text-xs text-muted-foreground">{student.className} · ID {student.shortid || "—"}</p></div><button onClick={() => assign("student", student.id)} disabled={assigning === `student:${student.id}`} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50">{assigning === `student:${student.id}` ? "…" : "Назначить"}</button></div>
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
