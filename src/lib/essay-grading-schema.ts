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
