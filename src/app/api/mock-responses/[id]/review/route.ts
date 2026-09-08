import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { CRITERION_LEVELS, ESSAY_CRITERIA, validateCriterionScores } from "@/lib/essay-rubric";

// Один роут, две формы оценки.
//
// ПО КРИТЕРИЯМ — сочинение родного языка: 12 критериев официального документа
// (tests-pdf/узб/ona_tili_yozma_2025_yangi.pdf), каждый по шкале 2/1.5/1/0.5/0,
// сумма и есть сырой балл. Балл при этом НЕ приходит с клиента: его считает
// RPC из самих критериев, иначе сумма могла бы разойтись с тем, из чего она
// сложена.
//
// ОДНИМ ЧИСЛОМ — всё остальное: английские Task 1 и Task 2 идут по своим
// официальным таблицам перевода (0.6, 1.3 … 10.0), там критериев в нашем
// смысле нет, и ломать этот путь под узбекский было бы неверно.
const CriterionScoreSchema = z.object({
    index: z.number().int().min(1).max(ESSAY_CRITERIA.length),
    score: z.number().refine(
        (v) => (CRITERION_LEVELS as readonly number[]).includes(v),
        { message: "Оценка вне шкалы 2 / 1,5 / 1 / 0,5 / 0" },
    ),
});

const CriteriaReviewSchema = z.object({
    verdict: z.enum(["SCORED", "OFF_TOPIC", "TOO_SHORT", "PLAGIARISM", "NOT_WRITTEN"]),
    criteria: z.array(CriterionScoreSchema).optional(),
    feedback: z.string().max(4000).default(""),
});

const PointsReviewSchema = z.object({
    // Official essay rubrics score in fractional increments (e.g. the English
    // conversion table: 0.6, 1.3, 1.9 ... 10.0) — a teacher grading against
    // that table needs to enter the exact value, not a rounded integer.
    points: z.number().min(0),
    feedback: z.string().max(4000),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const client = createRouteHandlerClient();
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const body = await req.json().catch(() => null);

    // Оценка по критериям: тело содержит verdict.
    const criteria = CriteriaReviewSchema.safeParse(body);
    if (criteria.success) {
        // Полноту набора проверяем ЗДЕСЬ же, а не только в базе: сообщение
        // «не оценён критерий 7» проверяющему понятнее, чем отказ RPC.
        if (criteria.data.verdict === "SCORED") {
            const validation = validateCriterionScores(criteria.data.criteria ?? []);
            if (!validation.ok) {
                return NextResponse.json({ error: validation.reason }, { status: 400 });
            }
        }
        const { data, error } = await client.rpc("review_mock_essay_criteria", {
            p_detail_id: params.id,
            p_scores: criteria.data.criteria ?? [],
            p_verdict: criteria.data.verdict,
            p_feedback: criteria.data.feedback,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 403 });
        return NextResponse.json(data);
    }

    const points = PointsReviewSchema.safeParse(body);
    if (!points.success) return NextResponse.json({ error: "Некорректная оценка" }, { status: 400 });
    const { data, error } = await client.rpc("review_mock_response", {
        p_detail_id: params.id,
        p_points: points.data.points,
        p_feedback: points.data.feedback,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json(data);
}
