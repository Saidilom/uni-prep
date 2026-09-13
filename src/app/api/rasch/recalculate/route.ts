import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { Observation, raschThetaToT, measurementPrecision, itemPrecision, MOCK_SCALE_MAX } from "@/lib/rasch";
import { computeSeparation, SeparationResult, RELIABILITY_HIGH_STAKES } from "@/lib/rasch-separation";
import {
    analyzeQuestion, parseSelection, correctOptionsFor, isClosedQuestion,
    DistractorResponse, QuestionDistractorReport,
} from "@/lib/distractor-analysis";
import { estimateTheta3pl, probability3pl } from "@/lib/irt-3pl";
import { calibrate3pl, type CalibratedItem } from "@/lib/irt-3pl-calibration";
import { itemFitReport, personFitReport, FitObservation, FitReport } from "@/lib/rasch-fit";
import { modelResiduals, standardizedResiduals, q3Analysis, residualPca, Q3Analysis, PcaResult } from "@/lib/rasch-q3";
import { classifyResponses, countStates, responseForModel, ResponseState } from "@/lib/response-status";
import { cohortStatistics, type CohortStatistics } from "@/lib/rasch-proportion";
import { essayPointsToScore75, combineSectionScores, isNativeCertSubject } from "@/lib/native-cert";
import { writingPointsToScore } from "@/lib/english-cefr";
import { certificateMaxForSubject, tScoreToScaleExact } from "@/lib/certificate-scale";
import { gradeLevelFromScore } from "@/lib/mock-grade-level";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { isInternalCall } from "@/lib/internal-auth";

// Пересчёт идёт по всей группе целиком, поэтому на большой группе он долгий.
// Без явного maxDuration функция Vercel обрывалась по умолчанию, а вызывающая
// сторона делала это «в фоне» и молча глотала сбой.
export const maxDuration = 300;

// Каким оценщиком и какой моделью получены числа (§109 — метод обязан быть
// виден в данных, а не только в коде).
const PERSON_ESTIMATOR = "MLE_NEWTON_3PL";
const MODEL_VERSION = "3pl-1.0";

// ═══ Как помечается смена метода в истории баллов ═══
//
// scale_version в ревизии описывает ПРЕЖНЕЕ значение — то, каким способом было
// получено число, которое ученик видел до пересчёта. reason называет саму
// правку. Так по строке ревизии видно и откуда, и куда.
const PREVIOUS_SCALE_VERSION = "v3-cohort/proportion-1pl";
const REVISION_REASON = "switch_to_3pl";

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

    const { data: test } = await admin.from("mock_tests")
        .select("subject_id, certificate_scale_max, cohort_mu, cohort_sigma, cohort_n, cohort_frozen_at")
        .eq("id", mockTestId).single();
    const subjectId = (test?.subject_id as string | null) ?? null;
    // Шкала показа ЗАКРЕПЛЕНА за тестом (миграция 112), а не выводится из
    // предмета заново. Иначе первая новая сдача в старый тест пересчитала бы
    // на новую шкалу все его прежние работы — включая уже показанные ученикам.
    // NULL у теста означает «по предмету» и бывает только у новых тестов.
    const pinnedScaleMax = test?.certificate_scale_max === null || test?.certificate_scale_max === undefined
        ? null
        : Number(test.certificate_scale_max);

    // Максимум показанного балла: 100 у общеобразовательных, 75 у английского
    // (решение владельца от 2026-09-10). T при этом остаётся 0–75 — это
    // измерение, а не показ. См. src/lib/certificate-scale.ts.
    //
    // Закреплённая за тестом шкала главнее предметной: она и есть обещание,
    // что уже показанный ученику балл не поменяется под ним.
    //
    // Объявлено ЗДЕСЬ, а не ниже у записи результатов: таблица баллов (§R.6)
    // строится раньше и берёт ту же шкалу. Объявление ниже давало обращение
    // до инициализации — ошибку, которую tsc поймал, а рантайм показал бы
    // пустым баллом.
    const certificateMax = pinnedScaleMax ?? certificateMaxForSubject(subjectId);

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
    // Сколько вариантов у задания: центр априорного c в 3PL равен 1/k.
    // У свободного ответа вариантов нет, и угадывание там закрепляется нулём.
    const optionCountByItem = objectiveQuestions.map((q) => {
        const options = (q as { options?: Record<string, unknown> | null }).options ?? null;
        const count = options ? Object.keys(options).length : 0;
        return count > 1 ? count : null;
    });
    const essayQuestionIds = new Set(essayQuestions.map((q) => q.id));
    const essayMaxPoints = essayQuestions.reduce((sum, q) => sum + Number(q.points || 0), 0);

    // Прежние значения читаются вместе с id: их надо положить в ревизию ДО
    // перезаписи (§239), а revealed_at отвечает на вопрос, видел ли ученик
    // это число вообще.
    const { data: results } = await admin.from("mock_results")
        .select("id, level_score, level_score_max, grade_level, rasch_score, revealed_at")
        .eq("mock_test_id", mockTestId);
    const resultRows = (results || []) as Array<{
        id: string; level_score: number | null; level_score_max: number | null;
        grade_level: string | null; rasch_score: number | null; revealed_at: string | null;
    }>;
    const resultIds = resultRows.map((r) => r.id);
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

    // ═══ Z-стандартизация ПО ПОТОКУ (шаги 5–6 документа владельца) ═══
    //
    // Решение владельца от 2026-09-11. μ и σ берутся у сдавших этот самый тест,
    // а не у эталонной популяции, как было до этого.
    //
    // Что это меняет, замерено на проде до правки и владельцем принято: средний
    // T выходит РОВНО 50 в любом тесте при любой подготовке (это свойство
    // центрирования, а не совпадение), все 90 существующих работ сменили букву,
    // сертификат получают 68 вместо 3. Балл теперь означает место в своей
    // группе, а не уровень подготовки; сравнивать месяцы им нельзя.
    //
    // Статистика ЗАКРЕПЛЯЕТСЯ за тестом, как только результат показан хотя бы
    // одному ученику: роут пересчитывает весь тест после каждой сдачи, и без
    // заморозки каждая новая работа двигала бы баллы всем остальным. Документ
    // этого и не требует — расчёт в нём идёт один раз, после закрытия теста.
    const frozenCohort: CohortStatistics | null = test?.cohort_frozen_at && test?.cohort_sigma !== null && test?.cohort_sigma !== undefined
        ? {
            mu: Number(test.cohort_mu),
            sigma: Number(test.cohort_sigma),
            count: Number(test.cohort_n ?? 0),
            status: "OK",
        }
        : null;
    const anyRevealed = resultRows.some((r) => r.revealed_at !== null);
    // Считается ниже, когда появятся θ: до них статистики потока не существует.
    let cohort: CohortStatistics = frozenCohort ?? { mu: NaN, sigma: NaN, count: 0, status: "TOO_FEW" };

    let personAbility: number[] = new Array(resultIds.length).fill(0);
    // Сложности нужны и ниже, при расчёте погрешности каждого балла, поэтому
    // живут снаружи блока, а не только внутри него.
    let itemDifficultyByIndex: number[] = new Array(questionIds.length).fill(0);
    // Полные параметры заданий (a, b, c). Нужны и погрешности, и fit, и
    // графикам: под 3PL одной трудности уже недостаточно.
    let itemParameters: CalibratedItem[] = [];

    // ═══ Погрешность балла (ТЗ D.3, D.4, §215, §217) ═══
    //
    // Без неё сотые доли балла обещают точность, которой нет: на этом же
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
    // Свойства прежней итерационной калибровки. У расчёта сложности по доле
    // решивших их нет — остаются null и такими уходят в базу.
    let converged: boolean | null = true;
    let iterations: number | null = 0;

    // Сколько работ WLE не сошлось (§C.4): молча такое проглатывать нельзя,
    // поэтому счётчик уходит в ответ вместе с остальной диагностикой.
    let wleNonConverged = 0;
    // Сколько раз сырой балл не нашёлся в таблице варианта. Должно быть 0;
    // ненулевое значение означает, что ответы и вариант разошлись.
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
        // ═══ КАЛИБРОВКА ЗАДАНИЙ ПО 3PL ═══
        //
        // Решение владельца от 2026-09-13: модель Раша убрана, балл считает
        // трёхпараметрическая модель. Прежние способы (JMLE, а затем сложность
        // из доли решивших) в расчёте балла больше не участвуют.
        //
        // Матрица берётся та же, что и раньше, — калибровочная, без пропусков
        // (§A.3): пропуск не есть попытка, и это решение отдельное от выбора
        // модели.
        const calibrationByItem: Array<Array<0 | 1 | null>> = questionIds.map(() => []);
        for (let person = 0; person < resultIds.length; person++) {
            stateByPersonItem[person].forEach((state, item) => {
                calibrationByItem[item].push(responseForModel(state, "CALIBRATION"));
            });
        }

        const calibration = calibrate3pl(
            questionIds.map((_, item) => ({
                responses: calibrationByItem[item],
                optionCount: optionCountByItem[item],
            })),
        );
        itemParameters = calibration.items;
        itemDifficultyByIndex = calibration.items.map((item) => item.b);
        converged = calibration.converged;
        iterations = calibration.iterations;

        // ═══ ОЦЕНКА θ КАЖДОГО УЧЕНИКА ═══
        //
        // ═══ ТАБЛИЦЫ «СЫРОЙ БАЛЛ → θ» БОЛЬШЕ НЕТ, И ЭТО НЕ ПОТЕРЯ ═══
        //
        // Она existовала потому, что в модели Раша сырой балл — достаточная
        // статистика: у всех с одинаковым числом верных θ была одна и та же.
        // Именно отсюда брались три ученика с одинаковыми 51,67, про которых
        // спрашивал владелец.
        //
        // В 3PL достаточности нет: в уравнение правдоподобия каждое задание
        // входит со своим весом a_i, поэтому важно, КАКИЕ задания решены. Два
        // ученика с одинаковым числом верных теперь получают разные баллы —
        // тот, кто решил трудные, выше того, кто решил лёгкие.
        const thetaResults = examResponses.map((row) =>
            estimateTheta3pl(row.map((correct, item) => ({ correct, item: calibration.items[item] }))),
        );
        personAbility = thetaResults.map((r) => r.theta);
        wleNonConverged = thetaResults.filter((r) => r.status === "NON_CONVERGED").length;

        // ═══ Статистика потока ═══
        //
        // Замороженная имеет приоритет: как только балл показан ученику, он не
        // должен меняться от того, кто сдаст после него.
        //
        // ВАЖНО: заморозка, сделанная под прежнюю модель, к 3PL не относится —
        // θ теперь в другой метрике. Если она стоит, её надо снять вместе с
        // пересчётом, иначе баллы посчитаются от чужой точки отсчёта.
        cohort = frozenCohort ?? cohortStatistics(personAbility);

        // Одно время на весь прогон: таблица и калибровка получены из одной и
        // той же матрицы ответов, и разные метки времени врали бы об этом.
        const calibratedAt = new Date().toISOString();

        // ═══ ТАБЛИЦА «СЫРОЙ БАЛЛ → θ» БОЛЬШЕ НЕ ПИШЕТСЯ ═══
        //
        // §R.6 требовал её потому, что в модели Раша сырой балл однозначно
        // задавал θ. В 3PL это неверно: задания входят со своими весами a_i, и
        // у двух учеников с одинаковым числом верных θ разная. Таблица из 56
        // строк физически не может описать такой расчёт — вместо неё расчёт
        // объясняет панель «Модель 3PL» следом итераций по каждому ученику.
        //
        // Прежние строки в mock_score_lookup удаляются: оставить их значило бы
        // показывать учителю объяснение балла, которого больше нет.
        await admin.from("mock_score_lookup").delete().eq("mock_test_id", mockTestId);

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
        //
        // Ожидание P(θ) считается ЗДЕСЬ, по действующей модели, и передаётся
        // готовым: сам модуль fit модели больше не знает. Иначе остатки
        // считались бы против кривой Раша, которой в расчёте балла уже нет, —
        // и расхождение было бы незаметным, потому что числа выходили бы
        // правдоподобные.
        const expectedByPersonItem: number[][] = Array.from({ length: resultIds.length }, () => []);
        const fitByItem: FitObservation[][] = Array.from({ length: questionIds.length }, () => []);
        const fitByPerson: FitObservation[][] = Array.from({ length: resultIds.length }, () => []);
        for (let person = 0; person < resultIds.length; person++) {
            examResponses[person].forEach((correct, item) => {
                const expected = probability3pl(personAbility[person], itemParameters[item]);
                expectedByPersonItem[person][item] = expected;
                const observation: FitObservation = { correct, expected, theta: personAbility[person] };
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
            modelResiduals(residualRows, expectedByPersonItem),
            { groupKeys: groupKeysByIndex },
        );
        pca = residualPca(standardizedResiduals(residualRows, expectedByPersonItem));

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
        const itemMeasures = itemDifficultyByIndex.map((b: number, i: number) => ({
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
        // Число для базы: NaN в колонку не отправляем, там его место занимает
        // NULL — и CHECK на положительную sigma это же и требует.
        const dbNumber = (value: number) => (Number.isFinite(value) ? value : null);
        const { error: summaryError } = await admin.from("mock_tests").update({
            // ═══ Статистика потока (шаги 5–6) ═══
            //
            // Записывается на каждом прогоне, пока не заморожена. Момент
            // заморозки — первый показанный ученику результат: с этого мгновения
            // его балл не должен меняться от того, кто сдаст после него.
            cohort_mu: dbNumber(cohort.mu),
            cohort_sigma: dbNumber(cohort.sigma),
            cohort_n: cohort.count,
            cohort_frozen_at: test?.cohort_frozen_at
                ?? (anyRevealed && cohort.status === "OK" ? calibratedAt : null),
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
            const precision = itemPrecision(itemDifficultyByIndex[i], abilitiesByItem[i]);
            const fit = itemFitReports[i];
            const itemStatus = n === 0
                ? "NO_OBSERVATIONS"
                : (correctByItem[i] === 0 || correctByItem[i] === n)
                    ? "EXTREME_SCORE"
                    : "OK";
            return {
                mock_test_id: mockTestId,
                question_id: id,
                // b, a и c — все три параметра 3PL. Одной трудности под этой
                // моделью недостаточно: без a и c кривую задания не построить,
                // и ни fit, ни графики не сойдутся с расчётом балла.
                difficulty: itemParameters[i].b,
                discrimination: itemParameters[i].a,
                guessing: itemParameters[i].c,
                guessing_prior: itemParameters[i].cPrior,
                option_count: optionCountByItem[i],
                difficulty_se: precision.thetaSe,
                item_status: itemStatus,
                sample_size: n,
                converged,
                iterations,
                // Какой политикой пропусков посчитаны эти сложности (§A.3) и
                // каким оценщиком — способность (§109: смена метода это новая
                // версия, и она обязана быть видна в данных).
                missing_policy: "CALIBRATION",
                person_estimator: `${PERSON_ESTIMATOR}/${MODEL_VERSION}`,
                // Каким методом получена сложность (§109). Без этой пометки
                // через полгода по строке калибровки нельзя будет сказать,
                // JMLE её посчитал или доля решивших.
                difficulty_method: "3PL_MMLE",
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
        // μ и σ — потока (шаг 6 документа). При status ≠ OK sigma равна NaN,
        // raschThetaToT вернёт NaN, и combineSectionScores отбросит этот
        // раздел: балла не будет вовсе, а не ноль вместо него.
        if (hasObjectiveSection) sections.push(raschThetaToT(personAbility[n], cohort.mu, cohort.sigma));
        if (hasEssaySection) sections.push(essayToScore75(essayEarnedByPerson[n], essayMaxPoints));
        return combineSectionScores(sections);
    });


    // Сколько разделов участвует в итоге. Итог — среднее арифметическое
    // разделов (Baholash_mezoni.pdf стр. 4), поэтому вклад Раш-раздела в
    // погрешность итога делится на их число.
    const sectionCount = (hasObjectiveSection ? 1 : 0) + (hasEssaySection ? 1 : 0);

    // Полезная нагрузка считается ОТДЕЛЬНО от записи: между ними надо успеть
    // положить в ревизии прежние значения (§239).
    const nextValues = resultIds.map((id, n) => {
            const t = tScores[n];
            // Балл НЕ округляется — ни для полосы уровня, ни для записи.
            //
            // §202–203: внутренние вычисления идут в полной точности, а
            // округление стоит один раз и только на выводе. Хранить
            // округлённое значило бы округлить В СЕРЕДИНЕ цепочки: этот балл
            // потом усредняется по группе, филиалу и учителю, и в каждое
            // среднее уходила бы уже срезанная точность.
            //
            // Показ по-прежнему с двумя знаками (§L.8 — правило округления
            // отчётного балла), но это делает formatScore на экране, а не
            // расчёт. Различимость от этого не страдает: на реальном варианте
            // математики различных баллов 49 из 56 и у точных, и у округлённых
            // до 0,1 — округление показа не склеивает ни одной пары.
            // По закреплённой шкале теста, а не по предметной: см.
            // certificateMax выше.
            const certificate = t === null ? null : tScoreToScaleExact(t, certificateMax);

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

            return {
                id,
                // rasch_score пишется только когда его есть из чего считать:
                // у теста из одного сочинения способности по Рашу не существует,
                // и ноль здесь читался бы как «средняя способность».
                rasch_score: hasObjectiveSection ? personAbility[n] : null,
                level_score: certificate,
                level_score_max: certificateMax,
                // Буква — от того же точного балла, а он получен из раш-меры θ
                // (raschThetaToT), а не из взвешенной суммы баллов за задания.
                // Веса заданий в измерение не входят вовсе.
                // Максимум передаётся ОБЯЗАТЕЛЬНО: пороги заданы на шкале 75,
                // а balls показывается из 100 у всех, кроме английского. Без
                // него сотенный балл сравнился бы с порогами из 75, и ученик
                // с T = 52,5 (это C+) получил бы A+.
                grade_level: certificate === null ? null : gradeLevelFromScore(certificate, { max: certificateMax }),
                theta_se: precision?.thetaSe ?? null,
                score_se: scoreSe,
                test_information: precision?.information ?? null,
                // Статус измерения, а не молчание: §215 требует различать
                // «результат существует» и «измерению можно доверять». У теста
                // из одного сочинения способности по Рашу нет вовсе — это тоже
                // INSUFFICIENT_INFORMATION, а не OK с пустой погрешностью.
                // Поток без разброса — это тоже отсутствие измерения, и статус
                // обязан это назвать. Балл при таком потоке пуст (sigma = NaN
                // выше), и «OK» рядом с пустым баллом противоречил бы сам себе.
                measurement_status: cohort.status !== "OK" && hasObjectiveSection
                    ? "INSUFFICIENT_INFORMATION"
                    : precision?.status ?? "INSUFFICIENT_INFORMATION",
                // Person-fit (§F.10). На балл и уровень НЕ влияет: §215
                // требует различать «результат есть» и «результат доверенный»,
                // а §N.2 прямо запрещает делать из misfit вывод о списывании.
                person_infit: personFitReports[n]?.infit ?? null,
                person_outfit: personFitReports[n]?.outfit ?? null,
                person_infit_zstd: personFitReports[n]?.infitZstd ?? null,
                person_outfit_zstd: personFitReports[n]?.outfitZstd ?? null,
                person_fit_flags: personFitReports[n]?.flags ?? null,
            };
    });

    // ═══ Ревизии перед перезаписью (§239) ═══
    //
    // Балл, который ученик уже видел, нельзя менять молча: в
    // mock_result_revisions ложится ПРЕЖНЕЕ значение вместе с версией шкалы,
    // по которой оно было получено.
    //
    // Только у показанных работ и только когда число действительно меняется:
    // роут запускается после каждой сдачи, и ревизия на каждый прогон
    // превратила бы таблицу в журнал вызовов вместо истории баллов.
    const previousById = new Map(resultRows.map((row) => [row.id, row]));
    const revisions = nextValues.flatMap((next) => {
        const previous = previousById.get(next.id);
        if (!previous || previous.revealed_at === null) return [];
        const scoreMoved = Number(previous.level_score ?? NaN) !== Number(next.level_score ?? NaN)
            && !(previous.level_score === null && next.level_score === null);
        const levelMoved = (previous.grade_level ?? null) !== (next.grade_level ?? null);
        if (!scoreMoved && !levelMoved) return [];
        return [{
            result_id: next.id,
            revised_at: new Date().toISOString(),
            reason: REVISION_REASON,
            level_score: previous.level_score,
            level_score_max: previous.level_score_max,
            grade_level: previous.grade_level,
            rasch_score: previous.rasch_score,
            scale_version: PREVIOUS_SCALE_VERSION,
        }];
    });
    if (revisions.length > 0) {
        const { error: revisionError } = await admin.from("mock_result_revisions").insert(revisions);
        if (revisionError) {
            // Без ревизии перезаписывать нельзя: прежнее значение исчезнет
            // безвозвратно, и объяснить ученику смену балла будет нечем.
            return NextResponse.json(
                { error: `Не удалось сохранить ревизии баллов: ${revisionError.message}` },
                { status: 500 },
            );
        }
    }

    const updateResults = await Promise.all(
        nextValues.map(({ id, ...payload }) => admin.from("mock_results").update(payload).eq("id", id)),
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
        personEstimator: `${PERSON_ESTIMATOR}/${MODEL_VERSION}`,
        wleNonConverged,
        // §R.6: балл взят из таблицы варианта. tableMisses обязан быть 0.
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
