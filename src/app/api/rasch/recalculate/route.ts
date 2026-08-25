import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { estimateRasch, Observation } from "@/lib/rasch";

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

    const { data: answers } = await admin
        .from("mock_answer_details")
        .select("result_id, question_id, is_correct")
        .in("result_id", resultIds);
    if (!answers || answers.length === 0) {
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

    await Promise.all(
        resultIds.map((id, n) => admin.from("mock_results").update({ rasch_score: personAbility[n] }).eq("id", id))
    );

    return NextResponse.json({
        ok: true,
        itemCount: questionIds.length,
        personCount: resultIds.length,
        converged,
        iterations,
    });
}
