import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { estimateRasch, Observation } from "@/lib/rasch";
import { raschThetaToT, writingPointsToScore, cefrBandFromScore, mean, stdev } from "@/lib/english-cefr";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

// Считается по всей группе, поэтому на большой группе долго. Раньше лимит
// времени не задавался вовсе.
export const maxDuration = 300;

// Runs after an English Mock submission (and after AI essay grading, so the
// Writing score is final) to compute the official CEFR scoring — see
// tests-pdf/англ/Multilevel-bm.pdf and src/lib/english-cefr.ts. Separate
// from /api/rasch/recalculate: that one calibrates the whole item pool
// together for the generic correct/total percentage every subject uses;
// this one needs Listening and Reading calibrated SEPARATELY (each gets
// its own T-score) and folds in the Writing rubric score, which isn't a
// Rasch item at all.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase service role not configured" }, { status: 500 });
  }
  const mockTestId = params.id;

  const sessionClient = createRouteHandlerClient();
  const { data: authData } = await sessionClient.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const { data: allowed } = await sessionClient.rpc("can_access_mock", { p_mock_test_id: mockTestId });
  if (!allowed) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: test } = await admin.from("mock_tests").select("id, subject_id").eq("id", mockTestId).single();
  if (!test || test.subject_id !== "english") {
    return NextResponse.json({ ok: true, skipped: "not an English mock" });
  }

  const { data: sections } = await admin.from("mock_sections").select("id, kind").eq("mock_test_id", mockTestId);
  if (!sections || sections.length === 0) return NextResponse.json({ ok: true, resultCount: 0 });

  const { data: questions } = await admin
    .from("mock_questions")
    .select("id, section_id, points, question_type")
    .in("section_id", sections.map((s) => s.id));
  if (!questions || questions.length === 0) return NextResponse.json({ ok: true, resultCount: 0 });

  const { data: results } = await admin.from("mock_results").select("id, user_id").eq("mock_test_id", mockTestId);
  if (!results || results.length === 0) return NextResponse.json({ ok: true, resultCount: 0 });
  const resultIds = results.map((r) => r.id as string);

  // Постранично — иначе матрицы listening/reading считаются по обрезанному
  // набору, а сумма баллов writing по недошедшим строкам читается как 0, и
  // ученик получает полосу на один-два уровня ниже. CEFR — сертифицируемое
  // утверждение, здесь молчаливое усечение недопустимо особенно.
  const { data: answers, error: answersError } = await fetchAllRows<{ result_id: string; question_id: string; is_correct: boolean; points_earned: number }>(
    (from, to) => admin
      .from("mock_answer_details")
      .select("result_id, question_id, is_correct, points_earned")
      .in("result_id", resultIds)
      .order("id")
      .range(from, to)
  );
  if (answersError) {
    return NextResponse.json({ error: `Не удалось прочитать ответы: ${answersError.message}` }, { status: 500 });
  }
  if (answers.length === 0) return NextResponse.json({ ok: true, resultCount: 0 });

  const sectionKindById = new Map(sections.map((s) => [s.id as string, s.kind as string]));
  const questionById = new Map(questions.map((q) => [q.id as string, q]));

  // Calibrates one objective section kind (listening/reading) in isolation
  // — each gets its own Rasch run and its own T-score, per the official
  // methodology, not one pool shared across the whole test.
  const computeSectionT = (kind: "listening" | "reading"): Map<string, number> => {
    const itemIds = questions.filter((q) => sectionKindById.get(q.section_id as string) === kind).map((q) => q.id as string);
    const tByResult = new Map<string, number>();
    if (itemIds.length === 0) return tByResult;

    const personIndex = new Map<string, number>();
    resultIds.forEach((id) => personIndex.set(id, personIndex.size));
    const itemIndex = new Map<string, number>();
    itemIds.forEach((id) => itemIndex.set(id, itemIndex.size));

    const observations: Observation[] = [];
    for (const a of answers) {
      const person = personIndex.get(a.result_id as string);
      const item = itemIndex.get(a.question_id as string);
      if (person === undefined || item === undefined) continue;
      observations.push({ person, item, correct: a.is_correct ? 1 : 0 });
    }
    if (observations.length === 0) return tByResult;

    const { personAbility } = estimateRasch(observations, resultIds.length, itemIds.length);
    const m = mean(personAbility);
    const sd = stdev(personAbility);
    resultIds.forEach((id, n) => tByResult.set(id, raschThetaToT(personAbility[n], m, sd)));
    return tByResult;
  };

  const listeningT = computeSectionT("listening");
  const readingT = computeSectionT("reading");

  // Writing isn't a Rasch item — sum whatever essay/rubric points this
  // result actually earned in writing-kind sections and run it through the
  // official conversion table.
  const writingPointsByResult = new Map<string, number>();
  for (const a of answers) {
    const question = questionById.get(a.question_id as string);
    if (!question) continue;
    if (sectionKindById.get(question.section_id as string) !== "writing") continue;
    const current = writingPointsByResult.get(a.result_id as string) ?? 0;
    writingPointsByResult.set(a.result_id as string, current + Number(a.points_earned || 0));
  }
  const hasWriting = questions.some((q) => sectionKindById.get(q.section_id as string) === "writing");

  const updates = resultIds.map((resultId) => {
    const sectionScores: number[] = [];
    if (listeningT.has(resultId)) sectionScores.push(listeningT.get(resultId)!);
    if (readingT.has(resultId)) sectionScores.push(readingT.get(resultId)!);
    if (hasWriting) sectionScores.push(writingPointsToScore(writingPointsByResult.get(resultId) ?? 0));

    if (sectionScores.length === 0) return { resultId, cefrScore: null, cefrBand: null };
    const avg = mean(sectionScores);
    return { resultId, cefrScore: Math.round(avg * 10) / 10, cefrBand: cefrBandFromScore(avg) };
  });

  const updateResults = await Promise.all(
    updates.map((u) => admin.from("mock_results").update({ cefr_score: u.cefrScore, cefr_band: u.cefrBand }).eq("id", u.resultId)),
  );
  const failedCount = updateResults.filter((r) => r.error).length;
  if (failedCount > 0) {
    console.error(`[cefr-recalculate] ${failedCount}/${updates.length} per-student score updates failed for mock ${mockTestId}`);
  }

  // Deliberately not returning `updates` — it's a per-student score list, and
  // this route is fire-and-forget from any caller who can access the test
  // (see can_access_mock check above), not scoped to only the caller's own row.
  return NextResponse.json({ ok: true, resultCount: resultIds.length, failedCount });
}
