import { z } from "zod";

export const EssayGradingResultSchema = z.object({
  score: z.number().min(0),
  feedback: z.string().min(1),
});

export type EssayGradingResult = z.infer<typeof EssayGradingResultSchema>;

// Handed to Gemini as `responseSchema` — same reasoning as
// IMPORTED_MOCK_JSON_SCHEMA in mock-import-schema.ts: without an enforced
// shape the model can return prose or a differently-named field and JSON
// parsing/validation fails unpredictably.
export const ESSAY_GRADING_JSON_SCHEMA = z.toJSONSchema(EssayGradingResultSchema, { target: "draft-7" });

// Пакетный вариант: работы многих учеников по ОДНОМУ заданию в одном запросе.
// `id` — это порядковый номер работы в промпте (A1, A2, …), а не идентификатор
// из базы: id ответов наружу не отдаём, а по короткой метке модель заметно
// реже путает строки местами.
export const BatchEssayGradingResultSchema = z.object({
  grades: z
    .array(
      z.object({
        id: z.string().min(1),
        score: z.number().min(0),
        feedback: z.string().min(1),
      })
    )
    .min(1),
});

export type BatchEssayGradingResult = z.infer<typeof BatchEssayGradingResultSchema>;

export const BATCH_ESSAY_GRADING_JSON_SCHEMA = z.toJSONSchema(BatchEssayGradingResultSchema, { target: "draft-7" });
