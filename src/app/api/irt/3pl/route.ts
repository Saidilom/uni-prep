import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { isInternalCall } from "@/lib/internal-auth";
import { classifyResponses, responseForModel } from "@/lib/response-status";
import { calibrate3pl, type CalibrationItemInput } from "@/lib/irt-3pl-calibration";
import { estimateTheta3pl, type Response3pl } from "@/lib/irt-3pl";
import { raschThetaToT } from "@/lib/rasch";
import { tScoreToScaleExact, certificateMaxForSubject } from "@/lib/certificate-scale";
import { gradeLevelFromScore } from "@/lib/mock-grade-level";
import { cohortStatistics } from "@/lib/rasch-proportion";

// Расчёт по модели 3PL — РЯДОМ с действующим баллом, а не вместо него.
//
// ═══ ЧЕГО ЭТОТ РОУТ НЕ ДЕЛАЕТ ═══
//
// Не пишет в mock_results. Не создаёт ревизий. Не трогает mock_item_calibration
// и mock_score_lookup. Балл ученика после его запуска остаётся ровно тем же —
// проверить это можно SQL-ом, и в плане проверка записана.
//
// §238 нормы требует: discrimination и guessing — это отдельная модель. Здесь
// она и живёт: свои таблицы, свой запуск кнопкой, своё сравнение на экране.
//
// ═══ ПОЧЕМУ ТА ЖЕ ТРАНСФОРМАЦИЯ БАЛЛА ═══
//
// θ переводится в балл тем же T = 10θ + 50 и той же шкалой теста, что и в
// действующем расчёте. Иначе разница в баллах шла бы от разных шкал, а не от
// разных моделей, и сравнение ничего бы не показало.

export const maxDuration = 300;

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

    // Считать 3PL может тот же, кто видит психометрику теста: админ и автор.
    // Ученику здесь нечего делать — это не его балл.
    //
    // Второй вызывающий — сервер с общим секретом: тем же способом
    // представляются пересчёт Раша и проверка эссе. Нужен, чтобы расчёт можно
    // было прогнать и проверить без браузерной сессии.
    const internal = isInternalCall(req);
    let role: string | undefined;
    let callerId: string | null = null;
    if (!internal) {
        const sessionClient = createRouteHandlerClient();
        const { data: authData } = await sessionClient.auth.getUser();
        if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
        const { data: profile } = await supabaseServer.from("users").select("role").eq("id", authData.user.id).single();
        role = profile?.role as string | undefined;
        callerId = authData.user.id;
        if (role !== "admin" && role !== "teacher") {
            return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
        }
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: test } = await admin
        .from("mock_tests")
        .select("subject_id, certificate_scale_max, cohort_mu, cohort_sigma, created_by")
        .eq("id", mockTestId)
        .single();
    if (!test) return NextResponse.json({ error: "Тест не найден" }, { status: 404 });
    if (role === "teacher" && test.created_by !== callerId) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const subjectId = (test.subject_id as string | null) ?? null;
    const scaleMax = test.certificate_scale_max === null || test.certificate_scale_max === undefined
        ? certificateMaxForSubject(subjectId)
        : Number(test.certificate_scale_max);

    // ═══ Матрица ответов — та же, что у действующего расчёта ═══
    const { data: sections } = await admin.from("mock_sections").select("id").eq("mock_test_id", mockTestId);
    const sectionIds = (sections || []).map((s) => s.id as string);
    if (sectionIds.length === 0) return NextResponse.json({ ok: true, itemCount: 0, personCount: 0 });

    const { data: questions } = await admin
        .from("mock_questions")
        .select("id, question_type, options")
        .in("section_id", sectionIds)
        .order("order");
    const objective = (questions || []).filter((q) => q.question_type !== "essay");
    const questionIds = objective.map((q) => q.id as string);
    if (questionIds.length === 0) return NextResponse.json({ ok: true, itemCount: 0, personCount: 0 });

    // Число вариантов у каждого задания — центр априорного c равен 1/k.
    // У свободного ответа вариантов нет, и угадывание там закрепляется нулём.
    const optionCounts = objective.map((q) => {
        const options = q.options as Record<string, unknown> | null;
        const count = options ? Object.keys(options).length : 0;
        return count > 1 ? count : null;
    });

    const { data: results } = await admin.from("mock_results").select("id").eq("mock_test_id", mockTestId);
    const resultIds = (results || []).map((r) => r.id as string);
    if (resultIds.length === 0) return NextResponse.json({ ok: true, itemCount: questionIds.length, personCount: 0 });

    const { data: answers, error: answersError } = await fetchAllRows<{
        result_id: string; question_id: string; is_correct: boolean; selected_answer: string | null;
    }>(
        (from, to) => admin
            .from("mock_answer_details")
            .select("result_id, question_id, is_correct, selected_answer")
            .in("result_id", resultIds)
            .order("id")
            .range(from, to)
    );
    if (answersError) {
        return NextResponse.json({ error: `Не удалось прочитать ответы: ${answersError.message}` }, { status: 500 });
    }

    const personIndex = new Map(resultIds.map((id, i) => [id, i]));
    const answerByKey = new Map<string, { correct: boolean; answered: boolean }>();
    for (const a of answers) {
        const person = personIndex.get(a.result_id);
        if (person === undefined) continue;
        const raw = a.selected_answer;
        const answered = raw !== null && raw !== undefined && raw !== "" && raw !== "null" && raw !== "undefined";
        answerByKey.set(`${person}:${a.question_id}`, { correct: !!a.is_correct, answered });
    }

    // Та же политика пропусков (§A.3): в калибровку они не идут, в балл ученика
    // идут нулём. Расходиться с действующим расчётом здесь нельзя — иначе
    // сравнение моделей сравнивало бы заодно и разные политики.
    const calibrationMatrix: Array<Array<0 | 1 | null>> = questionIds.map(() => []);
    const examMatrix: Array<Array<0 | 1>> = [];
    for (let person = 0; person < resultIds.length; person++) {
        const ordered = questionIds.map((qid) => answerByKey.get(`${person}:${qid}`) ?? { correct: false, answered: false });
        const states = classifyResponses(ordered);
        const examRow: Array<0 | 1> = [];
        states.forEach((state, item) => {
            calibrationMatrix[item].push(responseForModel(state, "CALIBRATION"));
            examRow.push(responseForModel(state, "EXAM") as 0 | 1);
        });
        examMatrix.push(examRow);
    }

    // ═══ Калибровка заданий ═══
    const inputs: CalibrationItemInput[] = questionIds.map((_, item) => ({
        responses: calibrationMatrix[item],
        optionCount: optionCounts[item],
    }));
    const calibration = calibrate3pl(inputs);

    // ═══ Оценка θ каждого ученика ═══
    const perPerson = examMatrix.map((row) => {
        const responses: Response3pl[] = row.map((correct, item) => ({ correct, item: calibration.items[item] }));
        return estimateTheta3pl(responses);
    });

    // ═══ Балл — той же трансформацией, что и действующий ═══
    //
    // Точка отсчёта берётся закреплённая за тестом, если она есть; иначе
    // считается по потоку 3PL-оценок. Так балл 3PL и балл Раша меряются от
    // одного места, и разница между ними — это разница МОДЕЛЕЙ.
    const frozenSigma = test.cohort_sigma === null || test.cohort_sigma === undefined ? null : Number(test.cohort_sigma);
    const cohort = frozenSigma !== null
        ? { mu: Number(test.cohort_mu), sigma: frozenSigma, count: resultIds.length, status: "OK" as const }
        : cohortStatistics(perPerson.map((p) => p.theta));

    const calibratedAt = new Date().toISOString();

    await admin.from("mock_item_calibration_3pl").delete().eq("mock_test_id", mockTestId);
    const { error: itemsError } = await admin.from("mock_item_calibration_3pl").insert(
        calibration.items.map((item, i) => ({
            mock_test_id: mockTestId,
            question_id: questionIds[i],
            discrimination: item.a,
            difficulty: item.b,
            guessing: item.c,
            guessing_prior: item.cPrior,
            option_count: optionCounts[i],
            sample_size: item.sampleSize,
            correct_count: item.correctCount,
            item_status: item.status,
            calibrated_at: calibratedAt,
        })),
    );
    if (itemsError) {
        return NextResponse.json({ error: `Не удалось сохранить параметры заданий: ${itemsError.message}` }, { status: 500 });
    }

    await admin.from("mock_result_3pl").delete().eq("mock_test_id", mockTestId);
    const { error: peopleError } = await admin.from("mock_result_3pl").insert(
        perPerson.map((person, i) => {
            const t = cohort.status === "OK" ? raschThetaToT(person.theta, cohort.mu, cohort.sigma) : NaN;
            const score = Number.isFinite(t) ? tScoreToScaleExact(t, scaleMax) : null;
            return {
                result_id: resultIds[i],
                mock_test_id: mockTestId,
                theta: person.theta,
                theta_se: Number.isFinite(person.standardError) ? person.standardError : null,
                information: person.information,
                iterations: person.iterations,
                theta_status: person.status,
                scaled_score: score,
                scaled_score_max: score === null ? null : scaleMax,
                grade_level: score === null ? null : gradeLevelFromScore(score, { max: scaleMax }),
                computed_at: calibratedAt,
            };
        }),
    );
    if (peopleError) {
        return NextResponse.json({ error: `Не удалось сохранить оценки: ${peopleError.message}` }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        itemCount: questionIds.length,
        personCount: resultIds.length,
        emIterations: calibration.iterations,
        emConverged: calibration.converged,
        priors: calibration.priors,
        cohortStatus: cohort.status,
        // Сколько наблюдений приходится на один оцениваемый параметр — число,
        // без которого красивая таблица создаёт ложную уверенность.
        observationsPerParameter:
            (resultIds.length * questionIds.length) / (questionIds.length * 3 + resultIds.length),
    });
}
