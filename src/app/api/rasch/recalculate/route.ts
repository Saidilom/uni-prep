import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { estimateRasch, Observation, mean, stdev, raschThetaToT, MOCK_SCALE_MAX } from "@/lib/rasch";
import { essayPointsToScore75, combineSectionScores, isNativeCertSubject } from "@/lib/native-cert";
import { writingPointsToScore } from "@/lib/english-cefr";
import { gradeLevelFromScore } from "@/lib/mock-grade-level";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { isInternalCall } from "@/lib/internal-auth";

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
    // Второй вызывающий — авто-публикация (§15): у неё нет сессии, а
    // пересчитать уровень после раскрытия результатов обязательно.
    if (!isInternalCall(req)) {
        const sessionClient = createRouteHandlerClient();
        const { data: authData } = await sessionClient.auth.getUser();
        if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
        const { data: allowed } = await sessionClient.rpc("can_access_mock", { p_mock_test_id: mockTestId });
        if (!allowed) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: test } = await admin.from("mock_tests").select("subject_id").eq("id", mockTestId).single();
    const subjectId = (test?.subject_id as string | null) ?? null;

    const { data: sections } = await admin.from("mock_sections").select("id").eq("mock_test_id", mockTestId);
    const sectionIds = (sections || []).map((s) => s.id as string);
    if (sectionIds.length === 0) {
        return NextResponse.json({ ok: true, itemCount: 0, personCount: 0 });
    }

    const { data: questions } = await admin
        .from("mock_questions")
        .select("id, question_type, points")
        .in("section_id", sectionIds);
    const allQuestions = (questions || []) as Array<{ id: string; question_type: string | null; points: number | null }>;
    if (allQuestions.length === 0) {
        return NextResponse.json({ ok: true, itemCount: 0, personCount: 0 });
    }

    // Сочинение — не дихотомическое задание, и в пул Раша ему нельзя.
    //
    // Модель Раша оперирует «верно / неверно», а у эссе есть только частичный
    // балл, и is_correct у него всегда false. На проде это видно буквально:
    // работа на 20 баллов из 24 лежит с is_correct = false и уходила в
    // калибровку как проваленное задание. Ученик, написавший сочинение почти
    // идеально, получал за него ту же единицу информации, что и не писавший.
    //
    // Официальная методика (Baholash_mezoni.pdf, стр. 3-4) того же мнения:
    // «test topshiriqlari birinchi, yozma ish ikkinchi bo'lim sifatida
    // olinadi» — это два РАЗДЕЛА, считаются порознь и потом усредняются.
    const essayQuestions = allQuestions.filter((q) => q.question_type === "essay");
    const objectiveQuestions = allQuestions.filter((q) => q.question_type !== "essay");
    const questionIds = objectiveQuestions.map((q) => q.id);
    const essayQuestionIds = new Set(essayQuestions.map((q) => q.id));
    const essayMaxPoints = essayQuestions.reduce((sum, q) => sum + Number(q.points || 0), 0);

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
    const { data: answers, error: answersError } = await fetchAllRows<{ result_id: string; question_id: string; is_correct: boolean; points_earned: number | null }>(
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
    if (answers.length === 0) {
        return NextResponse.json({ ok: true, itemCount: 0, personCount: 0 });
    }

    const personIndex = new Map<string, number>();
    resultIds.forEach((id) => personIndex.set(id, personIndex.size));
    const itemIndex = new Map<string, number>();
    questionIds.forEach((id) => itemIndex.set(id, itemIndex.size));

    // Раздел «сочинение»: сумма набранного за эссе по каждой работе.
    const essayEarnedByPerson = new Array(resultIds.length).fill(0);
    const observations: Observation[] = [];
    for (const a of answers) {
        const person = personIndex.get(a.result_id as string);
        if (person === undefined) continue;
        if (essayQuestionIds.has(a.question_id as string)) {
            essayEarnedByPerson[person] += Number(a.points_earned || 0);
            continue;
        }
        const item = itemIndex.get(a.question_id as string);
        if (item === undefined) continue;
        observations.push({ person, item, correct: a.is_correct ? 1 : 0 });
    }

    // Тест, состоящий из одного сочинения (такой на проде есть — English
    // Paper 3 Writing), даёт ноль наблюдений для Раша. Это не ошибка: у него
    // просто нет первого раздела, и балл считается по одному второму.
    const hasObjectiveSection = observations.length > 0;
    const hasEssaySection = essayQuestions.length > 0 && essayMaxPoints > 0;
    if (!hasObjectiveSection && !hasEssaySection) {
        return NextResponse.json({ ok: true, itemCount: 0, personCount: 0 });
    }

    let personAbility: number[] = new Array(resultIds.length).fill(0);
    let converged = true;
    let iterations = 0;

    if (hasObjectiveSection) {
        const estimated = estimateRasch(observations, resultIds.length, questionIds.length);
        personAbility = estimated.personAbility;
        converged = estimated.converged;
        iterations = estimated.iterations;

        const sampleSizeByItem = new Array(questionIds.length).fill(0);
        for (const obs of observations) sampleSizeByItem[obs.item]++;

        const calibrationRows = questionIds.map((id, i) => ({
            mock_test_id: mockTestId,
            question_id: id,
            difficulty: estimated.itemDifficulty[i],
            sample_size: sampleSizeByItem[i],
            calibrated_at: new Date().toISOString(),
        }));

        const { error: calibrationError } = await admin
            .from("mock_item_calibration")
            .upsert(calibrationRows, { onConflict: "mock_test_id,question_id" });
        if (calibrationError) {
            return NextResponse.json({ error: calibrationError.message }, { status: 500 });
        }
    }

    // Standardize this cohort's abilities onto the same 0-75 scale used for
    // English's official CEFR scoring — Z-score against the people who took
    // THIS mock, not a fixed/absolute scale.
    //
    // Балл проставляется всегда, в том числе на вырожденной когорте (меньше
    // двух различающихся оценок способности). Там стандартизовать не по чему,
    // и raschThetaToT отсчитывает от сложности самих вопросов вместо когорты —
    // см. комментарий у него.
    //
    // Раньше в этом случае писался NULL. Замысел был честный (не показывать
    // подставную середину шкалы), но на деле балла лишались все: пересчёт
    // запускает только новая сдача, а пересдачи запрещены (§13), поэтому мок с
    // одним сдавшим оставался без балла навсегда. Цена нынешнего решения в том,
    // что когда тест сдадут ещё люди, балл пересчитается уже по когорте и может
    // сдвинуться — решение владельца, зафиксировано в design/FIX.md.
    const abilityMean = mean(personAbility);
    const abilityStdev = stdev(personAbility);

    // Итоговый балл — среднее арифметическое разделов, как в методике:
    // «birinchi va ikkinchi bo'limlarning o'rtacha arifmetik qiymati umumiy
    // ball sifatida qabul qilinadi» (Baholash_mezoni.pdf, стр. 4).
    //
    // У теста без сочинения раздел один, и среднее равно самому Rasch-баллу —
    // математика и физика ничего не заметят.
    // Таблица перевода сочинения зависит от предмета — своего документа у
    // каждого свой, и подставить чужой значит выставить неверный балл:
    //   родной язык — 24-балльный критерий, Baholash_mezoni.pdf стр. 3-4;
    //   английский — свой 0-36 и своя таблица, Multilevel-bm.pdf;
    //   остальные — официальной таблицы нет, поэтому просто доля от 75.
    // Последняя ветка пока умозрительная: эссе есть только у английского и
    // узбекского, но молча отдать им узбекскую таблицу было бы хуже.
    const essayToScore75 = isNativeCertSubject(subjectId)
        ? essayPointsToScore75
        : subjectId === "english"
            ? (earned: number, max: number) => (max > 0 ? writingPointsToScore(Math.max(0, Math.min(max, earned))) : 0)
            : (earned: number, max: number) => (max > 0 ? Math.round(Math.max(0, Math.min(max, earned)) / max * MOCK_SCALE_MAX) : 0);

    const levelScores = resultIds.map((_, n) => {
        const sections: number[] = [];
        if (hasObjectiveSection) sections.push(raschThetaToT(personAbility[n], abilityMean, abilityStdev));
        if (hasEssaySection) sections.push(essayToScore75(essayEarnedByPerson[n], essayMaxPoints));
        return combineSectionScores(sections);
    });

    const updateResults = await Promise.all(
        resultIds.map((id, n) => admin.from("mock_results").update({
            // rasch_score пишется только когда его есть из чего считать:
            // у теста из одного сочинения способности по Рашу не существует,
            // и ноль здесь читался бы как «средняя способность».
            rasch_score: hasObjectiveSection ? personAbility[n] : null,
            level_score: levelScores[n],
            grade_level: levelScores[n] === null ? null : gradeLevelFromScore(levelScores[n]),
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
