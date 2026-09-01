import { z } from "zod";

export const MOCK_SUBJECTS = [
  "math",
  "physics",
  "chemistry",
  "biology",
  "geography",
  "history",
  "english",
  "russian",
  "uzbek",
  "it",
  "other",
] as const;

export const MOCK_QUESTION_TYPES = [
  "single_choice",
  "multiple_choice",
  "true_false",
  "short_text",
  "numeric",
  "math_expression",
  "matching",
  "ordering",
  "table_completion",
  "essay",
] as const;

export const MockOptionSchema = z.object({
  id: z.string().min(1).max(12),
  text: z.string(),
});

export const ImportedQuestionSchema = z.object({
  number: z.string(),
  type: z.enum(MOCK_QUESTION_TYPES),
  prompt: z.string(),
  options: z.array(MockOptionSchema),
  correctOptionIds: z.array(z.string()),
  acceptedAnswers: z.array(z.string()),
  answerOrigin: z.enum(["provided", "inferred", "missing"]),
  // Official exams print fractional per-question weights (e.g. "[2,2 ball]"
  // on a Geography paper) — must not be .int(), or a value like 2.2 fails
  // schema validation and aborts the whole import.
  points: z.number().min(0).max(100),
  order: z.number().int().min(0),
  groupKey: z.string().nullable(),
  sharedStimulus: z.string().nullable(),
  sourcePage: z.number().int().min(1),
  // Which of the (possibly several) uploaded test-part PDFs sourcePage refers
  // to, 0-based in the order the files were given to Gemini — a mock built
  // from e.g. separate Reading/Writing/Listening papers needs this to know
  // which PDF to open, not just which page within "the" PDF (there is no
  // longer a single one). Required like every other field here so Gemini
  // always fills it in (0 for the common single-test-file case) rather than
  // this becoming yet another field the model can decide to omit.
  sourceFileIndex: z.number().int().min(0),
  needsSourceImage: z.boolean(),
  requiresManualReview: z.boolean(),
  confidence: z.number().min(0).max(1),
  reviewNote: z.string().nullable(),
  // Official grading-rubric summary for essay/writing tasks (English/Russian/
  // Uzbek written work) — shown to the teacher next to the manual-scoring
  // input instead of nothing, since these aren't graded by a single correct
  // answer. Null for every other question type.
  rubricNote: z.string().nullable(),
});

export const ImportedSectionSchema = z.object({
  title: z.string(),
  kind: z.enum(["general", "reading", "listening", "writing"]),
  instructions: z.string(),
  order: z.number().int().min(0),
  questions: z.array(ImportedQuestionSchema),
});

export const ImportedMockSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  subject: z.enum(MOCK_SUBJECTS),
  detectedSubjectLabel: z.string(),
  language: z.enum(["ru", "uz", "en", "mixed", "other"]),
  durationMinutes: z.number().int().min(1).max(600),
  instructions: z.string(),
  sections: z.array(ImportedSectionSchema).min(1),
  warnings: z.array(z.string()),
  documentSummary: z.string(),
});

export type ImportedQuestion = z.infer<typeof ImportedQuestionSchema>;
export type ImportedSection = z.infer<typeof ImportedSectionSchema>;
export type ImportedMock = z.infer<typeof ImportedMockSchema>;

// Handed to Gemini as `responseSchema` so it fills in the exact field names/types
// we require instead of guessing them from prose — without this, the model invents
// its own JSON shape each run and validation against ImportedMockSchema fails
// unpredictably on whichever field it happened to name or type differently.
export const IMPORTED_MOCK_JSON_SCHEMA = z.toJSONSchema(ImportedMockSchema, { target: "draft-7" });

export type MockImportResponse = {
  importId: string;
  // All uploaded test-part PDF paths, in the order given to Gemini —
  // question.sourceFileIndex indexes into this array. previewUrl only ever
  // shows sourcePdfPaths[0] (the review screen has one preview pane).
  sourcePdfPaths: string[];
  previewUrl: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  draft: ImportedMock;
};

export function countResponseItems(draft: ImportedMock): number {
  return draft.sections.reduce((sum, section) => sum + section.questions.length, 0);
}

// Essay/manual-review questions require a teacher or admin to actually read
// and grade the student's free-form answer (or pay for AI grading) — a free
// mock a teacher hands out to their own class shouldn't carry that ongoing
// grading burden, so those question types are reserved for paid (admin)
// mocks only.
export function getPublicationIssues(draft: ImportedMock, mode: "admin" | "teacher" = "admin"): string[] {
  const issues: string[] = [];
  if (!draft.title.trim()) issues.push("Укажите название теста");
  if (draft.sections.length === 0) issues.push("В тесте нет разделов");

  draft.sections.forEach((section, sectionIndex) => {
    if (section.questions.length === 0) {
      issues.push(`В разделе ${sectionIndex + 1} нет заданий`);
    }
    section.questions.forEach((question) => {
      const label = question.number || `${sectionIndex + 1}.${question.order + 1}`;
      if (!question.prompt.trim() && !question.sharedStimulus?.trim()) {
        issues.push(`Задание ${label}: отсутствует условие`);
      }
      const choiceType = ["single_choice", "multiple_choice", "true_false", "matching"].includes(question.type);
      if (choiceType && question.options.length < 2) {
        issues.push(`Задание ${label}: не распознаны варианты ответа`);
      }
      const autoTextType = ["short_text", "numeric", "math_expression", "ordering", "table_completion"].includes(question.type);
      if (!question.requiresManualReview && question.type !== "essay") {
        if (choiceType && question.correctOptionIds.length === 0) {
          issues.push(`Задание ${label}: не указан правильный вариант`);
        }
        if (autoTextType && question.acceptedAnswers.length === 0) {
          issues.push(`Задание ${label}: не указан допустимый ответ`);
        }
      }
      if (mode === "teacher" && (question.type === "essay" || question.requiresManualReview)) {
        issues.push(`Задание ${label}: эссе и вопросы с ручной проверкой доступны только в платных Mock-тестах`);
      }
    });
  });

  return issues;
}

