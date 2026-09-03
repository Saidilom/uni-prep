import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";
import { BATCH_ESSAY_GRADING_JSON_SCHEMA, BatchEssayGradingResultSchema } from "@/lib/essay-grading-schema";
import { buildBatchEssayGradingPrompt, BATCH_ESSAY_GRADING_SYSTEM_PROMPT } from "@/lib/essay-grading-prompt";
import { getGeminiThinkingConfig } from "@/lib/gemini-config";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Проверка письменных заданий всей группы — один раз при публикации
// результатов, а не на каждой сдаче. Работы группируются по заданию и режутся
// на пачки: модель получает сразу много ответов на одно и то же задание и
// ставит баллы по одной планке.
//
// Роут ВОЗОБНОВЛЯЕМЫЙ: он работает, пока укладывается в бюджет времени, и
// возвращает `remaining`. Вызывающая сторона просто дёргает его снова, пока
// remaining > 0. Повторный проход не портит уже проверенное — клейм
// `review_status = 'pending'` внутри ai_grade_mock_responses_batch атомарный
// (миграция 068).
const STUDENTS_PER_REQUEST = 22; // пачками по 20-25, как договорились
const TIME_BUDGET_MS = 210_000; // с запасом до maxDuration, чтобы успеть ответить

type PendingRow = {
  id: string;
  result_id: string;
  question_id: string;
  question_text: string;
  selected_answer: string | null;
  max_points: number;
};

function parseBatchVerdict(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = BatchEssayGradingResultSchema.safeParse(JSON.parse(trimmed));
  if (!parsed.success) throw new Error("Gemini вернул JSON не по схеме");
  return parsed.data;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const startedAt = Date.now();
  const client = createRouteHandlerClient();
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const mockTestId = params.id;
  const { data: mockTest } = await supabaseServer
    .from("mock_tests")
    .select("id, language, created_by")
    .eq("id", mockTestId)
    .single();
  if (!mockTest) return NextResponse.json({ error: "Тест не найден" }, { status: 404 });

  // Право проверять сверяет сама RPC (владелец или админ), но отказать до
  // обращения к модели дешевле — иначе за 403 уже заплатили бы токенами.
  const { data: isAdmin } = await client.rpc("is_admin");
  if (mockTest.created_by !== authData.user.id && !isAdmin) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { data: results } = await supabaseServer.from("mock_results").select("id").eq("mock_test_id", mockTestId);
  const resultIds = (results || []).map((r) => r.id as string);
  if (resultIds.length === 0) return NextResponse.json({ graded: 0, remaining: 0, requests: 0 });

  const { data: pending, error: pendingError } = await fetchAllRows<PendingRow>((from, to) =>
    supabaseServer
      .from("mock_answer_details")
      .select("id, result_id, question_id, question_text, selected_answer, max_points")
      .in("result_id", resultIds)
      .eq("review_status", "pending")
      .order("id")
      .range(from, to)
  );
  if (pendingError) {
    return NextResponse.json({ error: `Не удалось прочитать ответы: ${pendingError.message}` }, { status: 500 });
  }
  if (pending.length === 0) return NextResponse.json({ graded: 0, remaining: 0, requests: 0 });

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY не настроен" }, { status: 503 });
  }

  const questionIds = Array.from(new Set(pending.map((p) => p.question_id)));
  const { data: questions } = await supabaseServer.from("mock_questions").select("id, content").in("id", questionIds);
  const contentById = new Map(
    (questions || []).map((q) => [q.id as string, q.content as { rubricNote?: string | null; sharedStimulus?: string | null } | null])
  );

  // Группируем по заданию: одна планка на задание — весь смысл пакетной проверки.
  const byQuestion = new Map<string, PendingRow[]>();
  for (const row of pending) {
    const list = byQuestion.get(row.question_id) ?? [];
    list.push(row);
    byQuestion.set(row.question_id, list);
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

  let graded = 0;
  let requests = 0;
  let ranOutOfTime = false;
  const errors: string[] = [];

  for (const [questionId, rows] of Array.from(byQuestion.entries())) {
    for (let offset = 0; offset < rows.length; offset += STUDENTS_PER_REQUEST) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        ranOutOfTime = true;
        break;
      }
      const batch = rows.slice(offset, offset + STUDENTS_PER_REQUEST);
      // Короткая метка вместо uuid: id ответов наружу не отдаём, и по A1/A2
      // модель заметно реже путает строки местами.
      const labelToDetailId = new Map(batch.map((row, i) => [`A${i + 1}`, row.id]));
      const content = contentById.get(questionId);

      try {
        const prompt = buildBatchEssayGradingPrompt({
          language: (mockTest.language as string | null) ?? null,
          maxPoints: Number(batch[0].max_points) || 1,
          taskPrompt: batch[0].question_text || "",
          sharedStimulus: content?.sharedStimulus ?? null,
          rubricNote: content?.rubricNote ?? null,
          answers: batch.map((row, i) => ({ id: `A${i + 1}`, text: row.selected_answer || "" })),
        });
        const response = await ai.models.generateContent({
          model,
          contents: [{ text: prompt }],
          config: {
            systemInstruction: BATCH_ESSAY_GRADING_SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: BATCH_ESSAY_GRADING_JSON_SCHEMA,
            temperature: 0.2,
            maxOutputTokens: 512 * batch.length,
            thinkingConfig: getGeminiThinkingConfig(),
          },
        });
        requests++;
        const verdict = parseBatchVerdict(response.text || "");

        const payload = verdict.grades
          .filter((g) => labelToDetailId.has(g.id))
          .map((g) => ({ detailId: labelToDetailId.get(g.id), points: g.score, feedback: g.feedback }));

        if (payload.length > 0) {
          // Через сессионный клиент: RPC сама сверяет права по auth.uid().
          const { data: rpcData, error: rpcError } = await client.rpc("ai_grade_mock_responses_batch", {
            p_mock_test_id: mockTestId,
            p_grades: payload,
          });
          if (rpcError) throw rpcError;
          graded += Number((rpcData as { graded?: number } | null)?.graded ?? 0);
        }
        if (payload.length < batch.length) {
          errors.push(`Задание ${questionId}: модель вернула ${payload.length} оценок из ${batch.length}`);
        }
      } catch (error) {
        // Оставляем пачку в 'pending': учитель ещё может проверить вручную,
        // и повторный заход попробует её снова. Это лучше, чем записать ноль.
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (ranOutOfTime) break;
  }

  const remaining = Math.max(0, pending.length - graded);
  return NextResponse.json({
    graded,
    remaining,
    requests,
    ranOutOfTime,
    errors: errors.length ? errors.slice(0, 10) : undefined,
  });
}
