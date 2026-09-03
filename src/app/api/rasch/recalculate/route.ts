import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { estimateRasch, Observation, mean, stdev, raschThetaToT } from "@/lib/rasch";
import { gradeLevelFromScore } from "@/lib/mock-grade-level";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

// Пересчёт идёт по всей группе целиком, поэтому на большой группе он долгий.
// Без явного maxDuration функция Vercel обрывалась по умолчанию, а вызывающая
// сторона делала это «в фоне» и молча глотала сбой.
export const maxDuration = 300;

// Recalibrates the Rasch item difficulties + person abilities for one Mock
// test, across every attempt that test has on record — a single new
// submission changes the response matrix for the whole item pool, not just
// the submitter's own row, so the whole test is recomputed each time
// (Группа 7, задача 38: dedicated calculation service, separate from
// submit_mock and from mock_results.accuracy/score).
export async function POST(req: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: "Supabase service role not configured" }, { status: 500 });
    }

    const { mockTestId } = await req.json().catch(() => ({}));
    if (!mockTestId || typeof mockTestId !== "string") {
        return NextResponse.json({ error: "mockTestId is required" }, { status: 400 });
    }

    // Reuses can_access_mock — the exact set of callers for whom this
    // recalculation is meaningful (they have a result on this test, own it,
    // or are admin), since this route always fires right after the caller's
    // own submission and has no other legitimate trigger.
    const sessionClient = createRouteHandlerClient();
    const { data: authData } = await sessionClient.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const { data: allowed } = await sessionClient.rpc("can_access_mock", { p_mock_test_id: mockTestId });
    if (!allowed) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: sections } = await admin.from("mock_sections").select("id").eq("mock_test_id", mockTestId);
    const sectionIds = (sections || []).map((s) => s.id as string);
    if (sectionIds.length === 0) {
        return NextResponse.json({ ok: true, itemCount: 0, personCount: 0 });
    }

    const { data: questions } = await admin.from("mock_questions").select("id").in("section_id", sectionIds);
    const questionIds = (questions || []).map((q) => q.id as string);
    if (questionIds.length === 0) {
        return NextResponse.json({ ok: true, itemCount: 0, personCount: 0 });
    }

    const { data: results } = await admin.from("mock_results").select("id").eq("mock_test_id", mockTestId);
    const resultIds = (results || []).map((r) => r.id as string);
    if (resultIds.length === 0) {
        return NextResponse.json({ ok: true, itemCount: 0, personCount: 0 });
    }

    // Постранично: строк здесь takers × questions (100 × 35 = 3500), а
    // PostgREST режет ответ по `max_rows` молча. При усечении личный список
    // ниже строится по ПОЛНОМУ набору результатов, поэтому ученики без
    // дошедших наблюдений всё равно получали записанную оценку и уровень —
    // вырожденный, но показанный им на экране. См. lib/supabase/fetch-all.ts.
    const { data: answers, error: answersError } = await fetchAllRows<{ result_id: string; question_id: string; is_correct: boolean }>(
        (from, to) => admin
            .from("mock_answer_details")
            .select("result_id, question_id, is_correct")
            .in("result_id", resultIds)
            .order("id")
            .range(from, to)
    );
    if (answersError) {
        return NextResponse.json({ error: `Не удалось прочитать ответы: ${answersError.message}` }, { status: 500 });
    }
    if (answers.length === 0) {
        return NextResponse.json({ ok: true, itemCount: 0, personCount: 0 });
    }

    const personIndex = new Map<string, number>();
    resultIds.forEach((id) => personIndex.set(id, personIndex.size));
    const itemIndex = new Map<string, number>();
    questionIds.forEach((id) => itemIndex.set(id, itemIndex.size));

    const observations: Observation[] = [];
    for (const a of answers) {
        const person = personIndex.get(a.result_id as string);
        const item = itemIndex.get(a.question_id as string);
        if (person === undefined || item === undefined) continue;
        observations.push({ person, item, correct: a.is_correct ? 1 : 0 });
    }
    if (observations.length === 0) {
        return NextResponse.json({ ok: true, itemCount: 0, personCount: 0 });
    }

    const { itemDifficulty, personAbility, converged, iterations } = estimateRasch(
        observations,
        resultIds.length,
        questionIds.length
    );

    const sampleSizeByItem = new Array(questionIds.length).fill(0);
    for (const obs of observations) sampleSizeByItem[obs.item]++;

    const calibrationRows = questionIds.map((id, i) => ({
        mock_test_id: mockTestId,
        question_id: id,
        difficulty: itemDifficulty[i],
        sample_size: sampleSizeByItem[i],
        calibrated_at: new Date().toISOString(),
    }));

    const { error: calibrationError } = await admin
        .from("mock_item_calibration")
        .upsert(calibrationRows, { onConflict: "mock_test_id,question_id" });
    if (calibrationError) {
        return NextResponse.json({ error: calibrationError.message }, { status: 500 });
    }

    // Standardize this cohort's abilities onto the same 0-75 scale used for
    // English's official CEFR scoring (Z-score against the people who took
    // THIS mock, not a fixed/absolute scale) — meaningful once there's a
    // real cohort; with <2 distinct ability estimates raschThetaToT falls
    // back to 50 (scale center) for everyone, which is why a level shown
    // right after the first-ever attempt on a brand new mock isn't
    // trustworthy yet and should be read as provisional.
    const abilityMean = mean(personAbility);
    const abilityStdev = stdev(personAbility);
    const levelScores = personAbility.map((theta) => raschThetaToT(theta, abilityMean, abilityStdev));

    const updateResults = await Promise.all(
        resultIds.map((id, n) => admin.from("mock_results").update({
            rasch_score: personAbility[n],
            level_score: levelScores[n],
            grade_level: gradeLevelFromScore(levelScores[n]),
        }).eq("id", id))
    );
    const failedCount = updateResults.filter((r) => r.error).length;
    if (failedCount > 0) {
        console.error(`[rasch/recalculate] ${failedCount}/${resultIds.length} per-student score updates failed for mock ${mockTestId}`);
    }

    return NextResponse.json({
        ok: true,
        itemCount: questionIds.length,
        personCount: resultIds.length,
        converged,
        iterations,
        failedCount,
    });
}
