import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";
import { ESSAY_GRADING_JSON_SCHEMA, EssayGradingResultSchema } from "@/lib/essay-grading-schema";
import { buildEssayGradingPrompt, ESSAY_GRADING_SYSTEM_PROMPT } from "@/lib/essay-grading-prompt";
import { getGeminiThinkingConfig } from "@/lib/gemini-config";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const BodySchema = z.object({ resultId: z.string().uuid() });

function parseGeminiVerdict(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const json = JSON.parse(trimmed);
  const parsed = EssayGradingResultSchema.safeParse(json);
  if (!parsed.success) throw new Error("Gemini вернул JSON не по схеме");
  return parsed.data;
}

// Runs right after a student submits a Mock test with essay/writing
// questions in it. Those questions come out of submit_mock as
// review_status='pending' with points_earned=0 — this grades them
// immediately against the official rubric (see essay-grading-prompt.ts) so
// the student sees a real final score instead of waiting on a teacher who
// may never open the class results page.
export async function POST(req: NextRequest) {
  const routeClient = createRouteHandlerClient();
  const { data: authData } = await routeClient.auth.getUser();
  const authUser = authData.user;
  if (!authUser) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  const { resultId } = parsed.data;

  const { data: result } = await supabaseServer
    .from("mock_results")
    .select("id, user_id, mock_test_id")
    .eq("id", resultId)
    .single();
  if (!result || result.user_id !== authUser.id) {
    return NextResponse.json({ error: "Результат не найден" }, { status: 404 });
  }

  const { data: pending } = await supabaseServer
    .from("mock_answer_details")
    .select("id, question_id, question_text, selected_answer, max_points")
    .eq("result_id", resultId)
    .eq("review_status", "pending");

  if (!pending || pending.length === 0) {
    return NextResponse.json({ graded: 0, total: 0 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY не настроен" }, { status: 503 });
  }

  const { data: mockTest } = await supabaseServer.from("mock_tests").select("language").eq("id", result.mock_test_id).single();
  const questionIds = pending.map((p) => p.question_id as string);
  const { data: questions } = await supabaseServer.from("mock_questions").select("id, content").in("id", questionIds);
  const contentMap = new Map(
    (questions || []).map((q) => [q.id as string, q.content as { rubricNote?: string | null; sharedStimulus?: string | null } | null]),
  );

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

  let graded = 0;
  const errors: string[] = [];

  for (const detail of pending) {
    const maxPoints = Number(detail.max_points) || 1;
    try {
      const content = contentMap.get(detail.question_id as string);
      const prompt = buildEssayGradingPrompt({
        language: mockTest?.language ?? null,
        maxPoints,
        taskPrompt: (detail.question_text as string) || "",
        sharedStimulus: content?.sharedStimulus ?? null,
        rubricNote: content?.rubricNote ?? null,
        studentAnswer: (detail.selected_answer as string) || "",
      });
      const response = await ai.models.generateContent({
        model,
        contents: [{ text: prompt }],
        config: {
          systemInstruction: ESSAY_GRADING_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: ESSAY_GRADING_JSON_SCHEMA,
          temperature: 0.2,
          maxOutputTokens: 1024,
          thinkingConfig: getGeminiThinkingConfig(),
        },
      });
      const verdict = parseGeminiVerdict(response.text || "");
      const score = Math.max(0, Math.min(maxPoints, verdict.score));

      const { error: rpcError } = await routeClient.rpc("ai_grade_mock_response", {
        p_detail_id: detail.id,
        p_points: score,
        p_feedback: verdict.feedback,
      });
      if (rpcError) throw rpcError;
      graded++;
    } catch (error) {
      // Leave this one as 'pending' on failure — a teacher can still grade
      // it by hand, better than silently losing the essay's score entirely.
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return NextResponse.json({ graded, total: pending.length, errors: errors.length ? errors : undefined });
}
