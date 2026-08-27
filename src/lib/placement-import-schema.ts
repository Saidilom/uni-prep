import { z } from "zod";

// Placement ("Школа") questions are always single-choice with a definite
// correct answer — there's no manual-review or essay concept here at all,
// per the standing decision that Placement never shows a per-question
// breakdown to anyone, only the final percentage (see CLAUDE.md).
export const ImportedPlacementOptionSchema = z.object({
  id: z.string().min(1).max(4),
  text: z.string(),
});

export const ImportedPlacementQuestionSchema = z.object({
  number: z.string(),
  prompt: z.string(),
  options: z.array(ImportedPlacementOptionSchema).min(2).max(6),
  // null only when the source PDF truly doesn't reveal the answer — the
  // publish step blocks on this, since an ungraded question makes no sense
  // for a test that only ever reports a percentage.
  correctOptionId: z.string().nullable(),
  points: z.number().min(0).max(100),
  order: z.number().int().min(0),
  sourcePage: z.number().int().min(1),
  confidence: z.number().min(0).max(1),
});

export const ImportedPlacementTestSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  durationMinutes: z.number().int().min(1).max(240),
  passingScore: z.number().int().min(0).max(100),
  questions: z.array(ImportedPlacementQuestionSchema).min(1),
  warnings: z.array(z.string()),
});

export type ImportedPlacementQuestion = z.infer<typeof ImportedPlacementQuestionSchema>;
export type ImportedPlacementTest = z.infer<typeof ImportedPlacementTestSchema>;

export const IMPORTED_PLACEMENT_JSON_SCHEMA = z.toJSONSchema(ImportedPlacementTestSchema, { target: "draft-7" });

export function getPlacementPublicationIssues(draft: ImportedPlacementTest): string[] {
  const issues: string[] = [];
  if (!draft.title.trim()) issues.push("Укажите название теста");
  if (draft.questions.length === 0) issues.push("В тесте нет вопросов");
  draft.questions.forEach((q, index) => {
    const label = q.number || String(index + 1);
    if (!q.prompt.trim()) issues.push(`Вопрос ${label}: отсутствует текст`);
    if (q.options.length < 2) issues.push(`Вопрос ${label}: нужно минимум 2 варианта`);
    if (!q.correctOptionId) issues.push(`Вопрос ${label}: не указан правильный ответ`);
  });
  return issues;
}
