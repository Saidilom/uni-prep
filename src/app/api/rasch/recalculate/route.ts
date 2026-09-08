import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { estimateRasch, Observation, raschThetaToT, measurementPrecision, itemPrecision, MOCK_SCALE_MAX } from "@/lib/rasch";
import { computeSeparation, SeparationResult, RELIABILITY_HIGH_STAKES } from "@/lib/rasch-separation";
import {
    analyzeQuestion, parseSelection, correctOptionsFor, isClosedQuestion,
    DistractorResponse, QuestionDistractorReport,
} from "@/lib/distractor-analysis";
import { estimateThetaWle, WLE_ESTIMATOR, WLE_VERSION } from "@/lib/rasch-wle";
import { buildScoreTable, lookupScoreRow } from "@/lib/score-table";
import { itemFitReport, personFitReport, FitObservation, FitReport } from "@/lib/rasch-fit";
import { modelResiduals, standardizedResiduals, q3Analysis, residualPca, Q3Analysis, PcaResult } from "@/lib/rasch-q3";
import { classifyResponses, countStates, responseForModel, ResponseState } from "@/lib/response-status";
import { referencePopulationFor } from "@/lib/reference-population";
import { essayPointsToScore75, combineSectionScores, isNativeCertSubject } from "@/lib/native-cert";
import { writingPointsToScore } from "@/lib/english-cefr";
import { certificateMaxForSubject, tScoreToCertificateExact } from "@/lib/certificate-scale";
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

    // Порядок секций нужен не для красоты: NOT_REACHED (§A.4) определяется
    // ТОЛЬКО положением задания в варианте — «дальше ученик не отвечал».
    const { data: sections } = await admin
        .from("mock_sections")
        .select("id, order")
        .eq("mock_test_id", mockTestId);
    const sectionRows = (sections || []) as Array<{ id: string; order: number | null }>;
    const sectionIds = sectionRows.map((s) => s.id);
    if (sectionIds.length === 0) {
        return NextResponse.json({ ok: true, itemCount: 0, personCount: 0 });
    }
    const sectionOrder = new Map(sectionRows.map((s) => [s.id, Number(s.order ?? 0)]));

    const { data: questions } = await admin
        .from("mock_questions")
        // options/correct_answer/answer_key нужны разбору дистракторов (§R.7):
        // без полного списка вариантов невыбранный вариант не обнаружить — в
        // ответах его нет по определению.
        .select("id, question_type, points, section_id, order, group_key, options, correct_answer, answer_key")
        .in("section_id", sectionIds);
    const allQuestions = (questions || []) as Array<{
        id: string; question_type: string | null; points: number | null;
        section_id: string; order: number | null;
        options: Record<string, unknown> | null;
        correct_answer: string | null;
        answer_key: { values?: unknown } | null;
        // Testlet-метка: вопросы к одному тексту. Нужна модулю G не для
        // расчёта, а для интерпретации — зависимость внутри группы ожидаема.
        group_key: string | null;
    }>;
    if (allQuestions.length === 0) {
        return NextResponse.json({ ok: true, itemCount: 0, personCount: 0 });
    }
    // Тот же порядок, в котором ученик видел задания на экране.
    allQuestions.sort((a, b) =>
        (sectionOrder.get(a.section_id) ?? 0) - (sectionOrder.get(b.section_id) ?? 0)
        || Number(a.order ?? 0) - Number(b.order ?? 0));

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
    const { data: answers, error: answersError } = await fetchAllRows<{
        result_id: string; question_id: string; is_correct: boolean;
        points_earned: number | null; selected_answer: string | null;
    }>(
        (from, to) => admin
            .from("mock_answer_details")
            // selected_answer нужен, чтобы отличить «не отвечено» от
            // «ответил неверно»: у обоих is_correct = false. Неотвеченное
            // submit_mock пишет литералом 'null' (см. 066_admin_free_mock.sql).
            .select("result_id, question_id, is_correct, points_earned, selected_answer")
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

    // ═══ Статусы ответов: пропуск больше не равен неверному (§A.3–A.4) ═══
    //
    // Было: всё неотвеченное уходило в модель нулём. На проде это 636 ответов,
    // и 501 из них ХВОСТОВЫЕ — ученик не дошёл до конца. Модель читала это как
    // «пытался и не смог», то есть завышала сложность последних заданий и
    // занижала способность тех, кому не хватило времени.
    //
    // Стало: две политики (§A.3). Сложности калибруются БЕЗ пропусков, балл
    // ученику считается с пропуском как с нулём — это политика оценивания, а
    // не свойство модели.
    const answerByPersonQuestion = new Map<string, {
        correct: boolean; answered: boolean;
        // Что именно выбрано — нужно разбору дистракторов (§R.7). Разбирается
        // здесь один раз, а не в каждом месте, где понадобится.
        selected: string[];
    }>();
    for (const a of answers) {
        const person = personIndex.get(a.result_id as string);
        if (person === undefined) continue;
        if (essayQuestionIds.has(a.question_id as string)) {
            essayEarnedByPerson[person] += Number(a.points_earned || 0);
            continue;
        }
        // Неотвеченное submit_mock пишет литералом 'null'; пустая строка и
        // SQL NULL встречаются у более старых строк.
        const raw = a.selected_answer;
        const answered = raw !== null && raw !== undefined && raw !== "" && raw !== "null" && raw !== "undefined";
        answerByPersonQuestion.set(`${person}:${a.question_id}`, {
            correct: !!a.is_correct,
            answered,
            selected: answered ? parseSelection(raw) : [],
        });
    }

    // Разметка по каждой работе, в порядке предъявления заданий.
    const stateByPersonItem: ResponseState[][] = [];
    const totals = { CORRECT: 0, INCORRECT: 0, OMITTED: 0, NOT_REACHED: 0 };
    for (let person = 0; person < resultIds.length; person++) {
        const ordered = questionIds.map((qid) => {
            const found = answerByPersonQuestion.get(`${person}:${qid}`);
            // Строки нет вовсе — задание ученику не предъявлялось или ответ
            // потерян. Для модели это тоже отсутствие данных, не ноль.
            return found ?? { correct: false, answered: false };
        });
        const states = classifyResponses(ordered);
        stateByPersonItem.push(states);
        const counts = countStates(states);
        totals.CORRECT += counts.CORRECT;
        totals.INCORRECT += counts.INCORRECT;
        totals.OMITTED += counts.OMITTED;
        totals.NOT_REACHED += counts.NOT_REACHED;
    }

    // Матрица для КАЛИБРОВКИ: пропуски исключены из likelihood (§A.3).
    const observations: Observation[] = [];
    // Матрица для БАЛЛА ученику: пропуск не даёт баллов (политика EXAM).
    const examResponses: Array<Array<0 | 1>> = [];
    for (let person = 0; person < resultIds.length; person++) {
        const row: Array<0 | 1> = [];
        stateByPersonItem[person].forEach((state, item) => {
            const calibrated = responseForModel(state, "CALIBRATION");
            if (calibrated !== null) observations.push({ person, item, correct: calibrated });
            row.push(responseForModel(state, "EXAM") as 0 | 1);
        });
        examResponses.push(row);
    }

    // Тест, состоящий из одного сочинения (такой на проде есть — English
    // Paper 3 Writing), даёт ноль наблюдений для Раша. Это не ошибка: у него
    // просто нет первого раздела, и балл считается по одному второму.
    const hasObjectiveSection = observations.length > 0;
    const hasEssaySection = essayQuestions.length > 0 && essayMaxPoints > 0;
    if (!hasObjectiveSection && !hasEssaySection) {
        return NextResponse.json({ ok: true, itemCount: 0, personCount: 0 });
    }

    // Z-стандартизация по ЭТАЛОННОЙ популяции, а не по сдавшим этот мок.
    //
    // Раньше μ и σ брались из когорты того же теста, и люди измерялись
    // относительно самих себя: средний T выходил ровно 50 при любой подготовке,
    // а средний балл — 66.67 из 100. Прогресс между месяцами измерить было
    // нельзя, и сильная когорта понижала балл каждому.
    //
    // Формула та же, что в методике Агентства (стр. 1–2) — менялось только то,
    // относительно кого считать. Подробности и слабые места эталона —
    // src/lib/reference-population.ts и design/RASCH.md §268.
    //
    // Побочно исчезла ветка «вырожденная когорта»: у константы разброс не
    // вырождается, подменять нечего (§233).
    const reference = referencePopulationFor(subjectId);

    let personAbility: number[] = new Array(resultIds.length).fill(0);
    // Сложности нужны и ниже, при расчёте погрешности каждого балла, поэтому
    // живут снаружи блока, а не только внутри него.
    let itemDifficultyByIndex: number[] = new Array(questionIds.length).fill(0);

    // ═══ Погрешность балла (ТЗ D.3, D.4, §215, §217) ═══
    //
    // Без неё одна десятая в балле обещает точность, которой нет: на этом же
    // тесте SE вышла ±3,2–4,6 балла, и работы на 31,4 и 32,1 статистически
    // неразличимы. Это и есть ответ на «почему баллы повторяются» — повторы не
    // потеря информации, а её отсутствие сверх этого.
    //
    // Сложности берутся те, на которые ученик РЕАЛЬНО отвечал: при полных
    // данных это все задания, но матрица бывает разреженной (E.11), и тогда
    // суммировать по чужим заданиям означало бы завысить точность.
    //
    // Заполняется внутри блока ниже — сразу после калибровки, потому что
    // separation (§N.5) считается по этим же погрешностям и до записи сводки.
    const difficultiesByPerson: number[][] = Array.from({ length: resultIds.length }, () => []);
    let converged = true;
    let iterations = 0;

    // Сколько работ WLE не сошлось (§C.4): молча такое проглатывать нельзя,
    // поэтому счётчик уходит в ответ вместе с остальной диагностикой.
    let wleNonConverged = 0;
    // Сколько раз сырой балл не нашёлся в таблице варианта. Должно быть 0;
    // ненулевое значение означает, что ответы и вариант разошлись.
    let tableMisses = 0;
    let scoreTableRows = 0;
    // Fit-диагностика (модуль F). Пустые массивы у теста без раздела Раша:
    // соответствие модели там проверять не на чем.
    let itemFitReports: FitReport[] = [];
    let personFitReports: FitReport[] = [];
    // Модуль G. null у теста без раздела Раша: независимость проверять не на чем.
    let q3: Q3Analysis | null = null;
    let pca: PcaResult | null = null;
    // §N.5. null у теста без раздела Раша: у одного сочинения нет ни мер, ни
    // погрешностей, а «надёжность 0» читалось бы как измеренный результат.
    let personSeparation: SeparationResult | null = null;
    let itemSeparation: SeparationResult | null = null;
    // §R.7. Пусто у теста без раздела Раша: средних θ по вариантам там нет.
    let distractorReports: QuestionDistractorReport[] = [];

    if (hasObjectiveSection) {
        const estimated = estimateRasch(observations, resultIds.length, questionIds.length);
        itemDifficultyByIndex = estimated.itemDifficulty;
        converged = estimated.converged;
        iterations = estimated.iterations;

        // ═══ Балл берётся из ТАБЛИЦЫ варианта (§R.6) ═══
        //
        // Таблица «сырой балл → θ → балл → уровень» считается ОДИН раз на
        // вариант, а не на ученика. Это возможно потому, что при полных данных
        // в уравнение WLE входит только ЧИСЛО верных:
        //
        //   U_W(θ) = r − Σ_i P_i(θ) + J(θ)/(2·I(θ)),   r = Σ_i x_i
        //
        // Какие именно задания решены верно, здесь не участвует (§B.6). Значит
        // у всех, набравших r верных, θ одна и та же — и одинаковый балл у них
        // не «слипание», а свойство модели Раша.
        //
        // Способ оценки θ при этом НЕ меняется: таблица вызывает тот же
        // estimateThetaWle против тех же калиброванных b. Побочно уходит
        // разброс в последнем бите: раньше сумма Σ(x_i − P_i) складывалась в
        // порядке заданий, и у двоих с одинаковым числом верных θ отличалась
        // на ~1e-16 (на проде это видно как разброс 4e-16). Теперь строка одна
        // на всех по построению.
        const scoreTable = buildScoreTable(itemDifficultyByIndex, reference, {
            subjectId,
            hasSecondSection: hasEssaySection,
        });

        personAbility = examResponses.map((row) => {
            const rawScore = row.reduce((sum: number, correct) => sum + correct, 0);
            const tableRow = lookupScoreRow(scoreTable, rawScore);
            if (!tableRow) {
                // §233: строки нет — значит сырой балл вне варианта. Молча
                // брать соседнюю нельзя, поэтому считаем напрямую и помечаем.
                tableMisses++;
                const fallback = estimateThetaWle(row.map((correct, item) => ({
                    correct, difficulty: itemDifficultyByIndex[item],
                })));
                return Number.isFinite(fallback.theta) ? fallback.theta : 0;
            }
            if (tableRow.wleStatus === "NON_CONVERGED") wleNonConverged++;
            return tableRow.theta;
        });
        scoreTableRows = scoreTable.rows.length;

        // Одно время на весь прогон: таблица и калибровка получены из одной и
        // той же матрицы ответов, и разные метки времени врали бы об этом.
        const calibratedAt = new Date().toISOString();

        // Сохраняем таблицу: §R.6 требует, чтобы её можно было показать и
        // сверить, а §199 — чтобы по строке было видно, каким оценщиком и по
        // какой точке отсчёта получено число. Ученику она объясняет его балл,
        // учителю — почему у двоих он одинаковый.
        const lookupRows = scoreTable.rows.map((r) => ({
            mock_test_id: mockTestId,
            raw_score: r.rawScore,
            theta: r.theta,
            theta_se: r.thetaSe,
            test_information: r.information,
            section_score: r.sectionScore,
            score: r.score,
            grade_level: r.level,
            measurement_status: r.measurementStatus,
            wle_status: r.wleStatus,
            estimator: scoreTable.estimator,
            reference_version: scoreTable.referenceVersion,
            item_count: scoreTable.itemCount,
            built_at: calibratedAt,
        }));
        const { error: lookupError } = await admin
            .from("mock_score_lookup")
            .upsert(lookupRows, { onConflict: "mock_test_id,raw_score" });
        if (lookupError) {
            return NextResponse.json({ error: `Не удалось сохранить таблицу баллов: ${lookupError.message}` }, { status: 500 });
        }



        const sampleSizeByItem = new Array(questionIds.length).fill(0);
        // Крайний балл задания: все ответили верно или все неверно. По §165 и
        // E.9 сложность такого задания не оценивается (b уходит в ±∞), и держать
        // её наравне с остальными нельзя — только помечать.
        const correctByItem = new Array(questionIds.length).fill(0);
        // Способности тех, кто отвечал именно на это задание: из них считается
        // погрешность его сложности. При полных данных это все, но матрица
        // ответов бывает разреженной (E.11), и тогда суммировать надо только по
        // фактически отвечавшим.
        const abilitiesByItem: number[][] = Array.from({ length: questionIds.length }, () => []);
        // Верных и увиденных по каждому ученику — из них определяется крайний
        // балл для §N.5. Считаем в этом же проходе: искать их потом фильтром по
        // observations на каждого ученика значило бы пройти матрицу P раз.
        const correctByPerson = new Array(resultIds.length).fill(0);
        for (const obs of observations) {
            sampleSizeByItem[obs.item]++;
            correctByItem[obs.item] += obs.correct;
            abilitiesByItem[obs.item].push(personAbility[obs.person]);
            difficultiesByPerson[obs.person].push(itemDifficultyByIndex[obs.item]);
            correctByPerson[obs.person] += obs.correct;
        }

        // ═══ Fit-диагностика (модуль F) ═══
        //
        // Считается по той же матрице EXAM, что и балл, и НИЧЕГО в нём не
        // меняет: §224 требует помечать, а не удалять. Ни одно задание не
        // исключается, ни один ответ не выбрасывается — только флаги рядом.
        //
        // Берётся политика EXAM, а не CALIBRATION: fit отвечает на вопрос
        // «согласуются ли ФАКТИЧЕСКИЕ ответы с моделью», и пропуск, который
        // ученику зачли нулём, — тоже факт его работы.
        const fitByItem: FitObservation[][] = Array.from({ length: questionIds.length }, () => []);
        const fitByPerson: FitObservation[][] = Array.from({ length: resultIds.length }, () => []);
        for (let person = 0; person < resultIds.length; person++) {
            examResponses[person].forEach((correct, item) => {
                const observation: FitObservation = {
                    correct,
                    theta: personAbility[person],
                    difficulty: itemDifficultyByIndex[item],
                };
                fitByItem[item].push(observation);
                fitByPerson[person].push(observation);
            });
        }
        itemFitReports = fitByItem.map((observations) => itemFitReport(observations));
        personFitReports = fitByPerson.map((observations) => personFitReport(observations));

        // ═══ Локальная независимость и размерность (модуль G) ═══
        //
        // Считается по тем же ОЦЕНЁННЫМ θ и b, что дали балл — иначе базовый
        // уровень −1/(L−1) неверен: он возникает именно из того, что θ
        // оценивается по этим же ответам.
        //
        // Ничего не исключает и ничего не меняет в измерении (§222): балл,
        // уровень и сложности от Q3 не зависят вовсе.
        const groupKeysByIndex = objectiveQuestions.map((q) => q.group_key ?? null);
        const residualRows = examResponses as Array<Array<0 | 1 | null>>;
        q3 = q3Analysis(
            modelResiduals(residualRows, personAbility, itemDifficultyByIndex),
            { groupKeys: groupKeysByIndex },
        );
        pca = residualPca(standardizedResiduals(residualRows, personAbility, itemDifficultyByIndex));

        // Помеченные пары Q3. Переписываем набор целиком: пара, переставшая
        // быть зависимой после новых сдач, должна исчезнуть, а не остаться
        // висеть флагом навсегда.
        const { error: q3DeleteError } = await admin
            .from("mock_q3_flags").delete().eq("mock_test_id", mockTestId);
        if (q3DeleteError) {
            return NextResponse.json({ error: `Не удалось обновить Q3-флаги: ${q3DeleteError.message}` }, { status: 500 });
        }
        const q3Rows = (q3?.flaggedPairs ?? []).map((pair) => {
            // Порядок пары нормализован по id: одна пара — одна строка, как
            // требует ограничение question_a < question_b.
            const [a, b] = [questionIds[pair.itemA], questionIds[pair.itemB]].sort();
            return {
                mock_test_id: mockTestId,
                question_a: a,
                question_b: b,
                q3: pair.q3,
                q3_excess: pair.excess,
                baseline: q3!.baseline,
                threshold: q3!.threshold,
                persons: pair.persons,
                same_group: pair.sameGroup,
                flags: pair.flags,
                computed_at: calibratedAt,
            };
        });
        if (q3Rows.length > 0) {
            const { error: q3InsertError } = await admin.from("mock_q3_flags").insert(q3Rows);
            if (q3InsertError) {
                return NextResponse.json({ error: `Не удалось сохранить Q3-флаги: ${q3InsertError.message}` }, { status: 500 });
            }
        }

        // ═══ Separation и reliability (§N.5) ═══
        //
        // Считается по тем же мерам и погрешностям, которые уходят в
        // mock_results и mock_item_calibration, — отдельного прогона модели тут
        // нет и быть не должно, иначе сводка описывала бы не те числа, что
        // показаны ученику.
        //
        // Крайние меры (0 верных или все верные) в основной расчёт не входят.
        // У них θ не существует — правдоподобие монотонно, максимума нет, — а
        // показанное значение получено поправкой 0.3. Её SE не измерена, а
        // назначена: на математике это 2.18 логиты против 0.38 у остальных, и в
        // RMSE она входит квадратом, то есть одна такая работа весит как
        // тридцать обычных. Реально она роняет person reliability с 0.736 до
        // 0.495 — это разница между «тест грубоват» и «тест не работает».
        //
        // Но исключение не молчаливое (§233): рядом пишется, сколько мер
        // отброшено, и person_reliability_with_extremes — то же число со всеми.
        const personMeasures = personAbility.map((theta, p) => ({
            measure: theta,
            se: measurementPrecision(theta, difficultiesByPerson[p]).thetaSe,
            // Крайним считается балл относительно тех заданий, до которых
            // ученик дошёл, а не всего варианта (§A.4): не дошедший до
            // половины теста — не то же самое, что не решивший ничего.
            // Работа без единого наблюдения тоже крайняя: измерять там нечего.
            extreme: difficultiesByPerson[p].length === 0
                || correctByPerson[p] === 0
                || correctByPerson[p] === difficultiesByPerson[p].length,
        }));
        const itemMeasures = estimated.itemDifficulty.map((b, i) => ({
            measure: b,
            se: itemPrecision(b, abilitiesByItem[i]).thetaSe,
            // Та же логика для заданий: решённое всеми или никем не калибруется
            // (§165, E.9), и его SE так же назначена, а не измерена.
            extreme: sampleSizeByItem[i] === 0
                || correctByItem[i] === 0
                || correctByItem[i] === sampleSizeByItem[i],
        }));

        personSeparation = computeSeparation(personMeasures.filter((m) => !m.extreme));
        itemSeparation = computeSeparation(itemMeasures.filter((m) => !m.extreme));
        const personSeparationAll = computeSeparation(personMeasures);

        // ═══ Анализ дистракторов (§R.7) ═══
        //
        // Закрытым считается задание с двумя и более вариантами — признак из
        // самих данных, а не список типов: у открытых заданий options пуст, и
        // новый закрытый тип подхватится сам.
        //
        // Берутся ВСЕ закрытые задания варианта, включая исключённые из пула
        // Раша: разбор по вариантам не участвует в оценке способности и на
        // балл не влияет, а ошибку ключа полезно увидеть в любом задании.
        distractorReports = allQuestions
            .map((q) => {
                const optionKeys = Object.keys(q.options ?? {});
                if (!isClosedQuestion(optionKeys)) return null;
                const responses: DistractorResponse[] = resultIds.map((_, p) => ({
                    // Та же θ, что и в балле ученика. Для работ без раздела
                    // Раша её нет — такой ответ считается в долю, но не в
                    // среднюю.
                    theta: personAbility[p] ?? null,
                    selected: answerByPersonQuestion.get(`${p}:${q.id}`)?.selected ?? [],
                }));
                return analyzeQuestion(
                    q.id,
                    optionKeys,
                    correctOptionsFor(q.correct_answer, q.answer_key),
                    responses,
                );
            })
            .filter((r): r is QuestionDistractorReport => r !== null);

        // Пишем начисто: строка на пару «задание × вариант». Старые строки
        // удаляются, иначе после правки задания остался бы вариант, которого
        // в задании больше нет.
        const { error: distractorClearError } = await admin
            .from("mock_distractor_stats").delete().eq("mock_test_id", mockTestId);
        if (distractorClearError) {
            return NextResponse.json({ error: `Не удалось очистить разбор дистракторов: ${distractorClearError.message}` }, { status: 500 });
        }
        const distractorRows = distractorReports.flatMap((report) =>
            report.options.map((option) => ({
                mock_test_id: mockTestId,
                question_id: report.questionId,
                option_key: option.option,
                is_correct: option.isCorrect,
                choice_count: option.count,
                choice_share: option.share,
                mean_theta: option.meanTheta,
                flags: option.flags,
                respondents: report.respondents,
                omitted: report.omitted,
                correct_mean_theta: report.correctMeanTheta,
                question_status: report.status,
                computed_at: calibratedAt,
            })));
        if (distractorRows.length > 0) {
            const { error: distractorInsertError } = await admin
                .from("mock_distractor_stats").insert(distractorRows);
            if (distractorInsertError) {
                return NextResponse.json({ error: `Не удалось сохранить разбор дистракторов: ${distractorInsertError.message}` }, { status: 500 });
            }
        }

        // Сводка по варианту: без знаменателя число флагов не читается.
        const { error: summaryError } = await admin.from("mock_tests").update({
            q3_pairs_checked: q3?.pairs.filter((pair) => pair.excess !== null).length ?? null,
            q3_pairs_flagged: q3?.flaggedPairs.length ?? null,
            q3_max_excess: q3?.maxExcess ?? null,
            q3_mean_excess: q3?.meanExcess ?? null,
            pca_eigenvalues: pca?.eigenvalues ?? null,
            pca_flagged: pca?.flagged ?? null,
            diagnostics_at: calibratedAt,

            // §N.5. Пишутся и разложение (SD, RMSE, SD_true), и итог: по одному
            // числу нельзя отличить однородную когорту от грубого измерения.
            person_separation: personSeparation.separation,
            person_reliability: personSeparation.reliability,
            person_strata: personSeparation.strata,
            person_sd_observed: personSeparation.sdObserved,
            person_rmse: personSeparation.rmse,
            person_sd_true: personSeparation.sdTrue,
            person_measure_count: personSeparation.count,
            person_extreme_count: personMeasures.filter((m) => m.extreme).length,
            person_reliability_with_extremes: personSeparationAll.reliability,
            person_separation_status: personSeparation.status,

            item_separation: itemSeparation.separation,
            item_reliability: itemSeparation.reliability,
            item_strata: itemSeparation.strata,
            item_sd_observed: itemSeparation.sdObserved,
            item_rmse: itemSeparation.rmse,
            item_sd_true: itemSeparation.sdTrue,
            item_measure_count: itemSeparation.count,
            item_extreme_count: itemMeasures.filter((m) => m.extreme).length,
            item_separation_status: itemSeparation.status,
            separation_at: calibratedAt,

            // §R.7. Со знаменателем: «19 подозрений» читается только рядом с
            // «из 130 проверенных».
            distractor_questions_checked: distractorReports.length,
            distractor_questions_flagged: distractorReports.filter((r) => r.flags.length > 0).length,
            distractor_key_suspects: distractorReports.filter((r) => r.flags.includes("OUTPERFORMS_CORRECT")).length,
            distractor_dead_options: distractorReports.reduce(
                (sum, r) => sum + r.options.filter((o) => o.flags.includes("DEAD_DISTRACTOR")).length, 0),
            distractor_at: calibratedAt,
        }).eq("id", mockTestId);
        if (summaryError) {
            return NextResponse.json({ error: `Не удалось сохранить сводку диагностики: ${summaryError.message}` }, { status: 500 });
        }

        const calibrationRows = questionIds.map((id, i) => {
            const n = sampleSizeByItem[i];
            const precision = itemPrecision(estimated.itemDifficulty[i], abilitiesByItem[i]);
            const fit = itemFitReports[i];
            const itemStatus = n === 0
                ? "NO_OBSERVATIONS"
                : (correctByItem[i] === 0 || correctByItem[i] === n)
                    ? "EXTREME_SCORE"
                    : "OK";
            return {
                mock_test_id: mockTestId,
                question_id: id,
                difficulty: estimated.itemDifficulty[i],
                difficulty_se: precision.thetaSe,
                item_status: itemStatus,
                sample_size: n,
                converged: estimated.converged,
                iterations: estimated.iterations,
                // Какой политикой пропусков посчитаны эти сложности (§A.3) и
                // каким оценщиком — способность (§109: смена метода это новая
                // версия, и она обязана быть видна в данных).
                missing_policy: "CALIBRATION",
                person_estimator: `${WLE_ESTIMATOR}/${WLE_VERSION}`,
                // Модуль F. Флаги не влияют ни на балл, ни на сложность —
                // задание остаётся в расчёте, пока человек не решит иначе.
                infit: fit.infit,
                outfit: fit.outfit,
                infit_zstd: fit.infitZstd,
                outfit_zstd: fit.outfitZstd,
                point_measure: fit.pointMeasure,
                fit_flags: fit.flags,
                calibrated_at: calibratedAt,
            };
        });

        const { error: calibrationError } = await admin
            .from("mock_item_calibration")
            .upsert(calibrationRows, { onConflict: "mock_test_id,question_id" });
        if (calibrationError) {
            return NextResponse.json({ error: calibrationError.message }, { status: 500 });
        }
    }

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
            : (earned: number, max: number) => (max > 0 ? Math.max(0, Math.min(max, earned)) / max * MOCK_SCALE_MAX : 0);

    // T-балл (0-75) — промежуточная величина модели Раша. От НЕЁ считается
    // буква A+..C: пороги 70/65/60/55/50/46 в документе заданы на T-шкале.
    //
    // T больше не округляется — ни здесь, ни в raschThetaToT, ни в
    // combineSectionScores. Единственное округление балла живёт в roundScore
    // (src/lib/certificate-scale.ts), а буква сравнивает пороги с ближайшим
    // целым T внутри gradeLevelFromScore.
    const tScores = resultIds.map((_, n) => {
        const sections: number[] = [];
        if (hasObjectiveSection) sections.push(raschThetaToT(personAbility[n], reference.mu, reference.sigma));
        if (hasEssaySection) sections.push(essayToScore75(essayEarnedByPerson[n], essayMaxPoints));
        return combineSectionScores(sections);
    });

    // Балл сертификата — по той же шкале 75, что и T (решение владельца
    // «макс 75 во всех предметах»). См. src/lib/certificate-scale.ts.
    const certificateMax = certificateMaxForSubject(subjectId);

    // Сколько разделов участвует в итоге. Итог — среднее арифметическое
    // разделов (Baholash_mezoni.pdf стр. 4), поэтому вклад Раш-раздела в
    // погрешность итога делится на их число.
    const sectionCount = (hasObjectiveSection ? 1 : 0) + (hasEssaySection ? 1 : 0);

    const updateResults = await Promise.all(
        resultIds.map((id, n) => {
            const t = tScores[n];
            // Балл НЕ округляется — ни для полосы уровня, ни для записи.
            //
            // §202–203: внутренние вычисления идут в полной точности, а
            // округление стоит один раз и только на выводе. Хранить
            // округлённое значило бы округлить В СЕРЕДИНЕ цепочки: этот балл
            // потом усредняется по группе, филиалу и учителю, и в каждое
            // среднее уходила бы уже срезанная точность.
            //
            // Показ по-прежнему с одной десятой (§L.8 — правило округления
            // отчётного балла), но это делает formatScore на экране, а не
            // расчёт. Различимость от этого не страдает: на реальном варианте
            // математики различных баллов 49 из 56 и у точных, и у округлённых
            // до 0,1 — округление показа не склеивает ни одной пары.
            const certificate = t === null ? null : tScoreToCertificateExact(t, subjectId);

            // Погрешность есть только у Раш-раздела: у сочинения балл берётся
            // из таблицы документа, а не оценивается моделью, и своей ошибки у
            // него не посчитать (её дала бы MFRM, §87–93, OPTIONAL). Поэтому:
            //   один раздел  — score_se точна;
            //   два раздела  — делим на два, и это ТОЧНО, пока сочинение не
            //                  написано (ноль по таблице даёт ровно 0, без
            //                  оценивания), и НИЖНЯЯ ГРАНИЦА, когда написано.
            const precision = hasObjectiveSection
                ? measurementPrecision(personAbility[n], difficultiesByPerson[n])
                : null;
            const scoreSe = precision?.scoreSe !== null && precision?.scoreSe !== undefined && sectionCount > 0
                ? precision.scoreSe / sectionCount
                : null;

            return admin.from("mock_results").update({
                // rasch_score пишется только когда его есть из чего считать:
                // у теста из одного сочинения способности по Рашу не существует,
                // и ноль здесь читался бы как «средняя способность».
                rasch_score: hasObjectiveSection ? personAbility[n] : null,
                level_score: certificate,
                level_score_max: certificateMax,
                // Буква — от того же точного балла, а он получен из раш-меры θ
                // (raschThetaToT), а не из взвешенной суммы баллов за задания.
                // Веса заданий в измерение не входят вовсе.
                grade_level: certificate === null ? null : gradeLevelFromScore(certificate),
                theta_se: precision?.thetaSe ?? null,
                score_se: scoreSe,
                test_information: precision?.information ?? null,
                // Статус измерения, а не молчание: §215 требует различать
                // «результат существует» и «измерению можно доверять». У теста
                // из одного сочинения способности по Рашу нет вовсе — это тоже
                // INSUFFICIENT_INFORMATION, а не OK с пустой погрешностью.
                measurement_status: precision?.status ?? "INSUFFICIENT_INFORMATION",
                // Person-fit (§F.10). На балл и уровень НЕ влияет: §215
                // требует различать «результат есть» и «результат доверенный»,
                // а §N.2 прямо запрещает делать из misfit вывод о списывании.
                person_infit: personFitReports[n]?.infit ?? null,
                person_outfit: personFitReports[n]?.outfit ?? null,
                person_infit_zstd: personFitReports[n]?.infitZstd ?? null,
                person_outfit_zstd: personFitReports[n]?.outfitZstd ?? null,
                person_fit_flags: personFitReports[n]?.flags ?? null,
            }).eq("id", id);
        })
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
        // Диагностика шага 2: чем оценивали способность и сколько пропусков
        // ушло из калибровки вместо того, чтобы посчитаться нулями (§A.3).
        personEstimator: `${WLE_ESTIMATOR}/${WLE_VERSION}`,
        wleNonConverged,
        // §R.6: балл взят из таблицы варианта. tableMisses обязан быть 0.
        scoreTableRows,
        tableMisses,
        responseStates: totals,
        // Модуль F: сколько заданий и работ получили флаги. Ноль удалений —
        // §224 запрещает удалять автоматически.
        flaggedItems: itemFitReports.filter((r) => r.flags.length > 0).length,
        flaggedPersons: personFitReports.filter((r) => r.flags.length > 0).length,
        // Модуль G. Много флагов — сигнал испорченной калибровки, а не
        // «половина теста зависима»: см. шапку rasch-q3.ts.
        q3PairsChecked: q3?.pairs.filter((pair) => pair.excess !== null).length ?? 0,
        q3PairsFlagged: q3?.flaggedPairs.length ?? 0,
        q3WithinGroup: q3 ? `${q3.flaggedWithinGroup}/${q3.withinGroupPairs}` : null,
        q3MaxExcess: q3?.maxExcess ?? null,
        pcaEigenvalues: pca?.eigenvalues ?? null,
        pcaFlagged: pca?.flagged ?? null,
        // §N.5. `meetsHighStakes` — ответ на «годится ли для высоких ставок»
        // прямым флагом, а не оставленным читателю сравнением с 0.8.
        personReliability: personSeparation?.reliability ?? null,
        personSeparation: personSeparation?.separation ?? null,
        personStrata: personSeparation?.strata ?? null,
        personSeparationStatus: personSeparation?.status ?? null,
        itemReliability: itemSeparation?.reliability ?? null,
        itemSeparation: itemSeparation?.separation ?? null,
        itemSeparationStatus: itemSeparation?.status ?? null,
        // §R.7. Ни одно задание не удалено и не исключено (§222, §224) —
        // счётчики говорят только о том, на что стоит посмотреть глазами.
        distractorQuestionsChecked: distractorReports.length,
        distractorQuestionsFlagged: distractorReports.filter((r) => r.flags.length > 0).length,
        distractorKeySuspects: distractorReports.filter((r) => r.flags.includes("OUTPERFORMS_CORRECT")).length,
        distractorDeadOptions: distractorReports.reduce(
            (sum, r) => sum + r.options.filter((o) => o.flags.includes("DEAD_DISTRACTOR")).length, 0),
        // Выборы, которых нет среди вариантов задания. Обязан быть 0.
        distractorUnknownSelections: distractorReports.reduce((sum, r) => sum + r.unknownSelections, 0),
        highStakesThreshold: RELIABILITY_HIGH_STAKES,
        meetsHighStakes: personSeparation?.reliability !== null
            && personSeparation?.reliability !== undefined
            && personSeparation.reliability >= RELIABILITY_HIGH_STAKES,
        calibrationObservations: observations.length,
        examObservations: resultIds.length * questionIds.length,
    });
}
