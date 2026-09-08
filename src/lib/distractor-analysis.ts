// Анализ дистракторов закрытых заданий. ТЗ §R.7.
//
// ═══ ЗАЧЕМ ═══
//
// Fit (модуль F) отвечает на вопрос «задание ведёт себя не так, как должно»,
// но не говорит, ПОЧЕМУ. Разбор по вариантам отвечает: видно, какой именно
// вариант притягивает сильных учеников. Это самый прямой способ поймать
// ошибку ключа — если средняя способность выбравших вариант «c» выше, чем у
// выбравших «правильный» вариант «a», то верный ответ, скорее всего, «c».
//
// ═══ ЧТО СЧИТАЕТСЯ ═══
//
// Для каждого варианта: доля выбравших и средняя θ выбравших. Флаги:
//
//   OUTPERFORMS_CORRECT — средняя θ выбравших дистрактор ВЫШЕ, чем у выбравших
//                         верный ответ. Сигнал ошибки ключа.
//   DEAD_DISTRACTOR     — вариант не выбрал никто. Он не различает никого и
//                         фактически превращает задание из 4 вариантов в 3.
//
// ═══ ЧЕГО ЗДЕСЬ НЕТ ═══
//
// Удаления заданий. §222 и §224: флаг — это повод посмотреть, а не приговор.
// Задание остаётся в расчёте, пока человек не решит иначе.
//
// Модели тоже нет: θ приходит снаружи готовым. Этот модуль ничего не
// оценивает и ни на один балл не влияет.
//
// ═══ ЧЕГО НЕЛЬЗЯ ЧИТАТЬ БУКВАЛЬНО ═══
//
// Средняя θ на двух-трёх ответах — это не среднее, а два-три человека. На
// нашем моке 36 учеников и 4 варианта, то есть в среднем 9 на вариант, и у
// редкого дистрактора их будет один-два. Поэтому рядом с флагом всегда стоит
// счётчик, а сравнение на малой выборке дополнительно помечается LOW_COUNT:
// сам флаг при этом НЕ подавляется — прятать сигнал хуже, чем показать его с
// оговоркой (§233).
//
// Отдельно: θ здесь та же, что и в балле ученика, то есть посчитана В ТОМ
// ЧИСЛЕ по этому заданию. Небольшая самокорреляция заложена — так же устроена
// и point-measure корреляция в модуле F. На знак разницы между вариантами это
// не влияет, а именно знак и проверяется.

/** Минимум выборов, при котором средняя θ варианта вообще о чём-то говорит. */
export const MIN_OPTION_RESPONSES = 5;

/** Минимум ответивших на задание, при котором разбор имеет смысл. */
export const MIN_QUESTION_RESPONSES = 10;

export type DistractorFlag =
    /** Средняя θ выбравших этот дистрактор выше, чем у выбравших верный ответ. */
    | "OUTPERFORMS_CORRECT"
    /** Дистрактор не выбрал никто. */
    | "DEAD_DISTRACTOR"
    /** Выборов слишком мало, чтобы средняя θ что-то значила. */
    | "LOW_COUNT";

export type QuestionStatus =
    | "OK"
    /** Ответивших меньше MIN_QUESTION_RESPONSES — сравнивать не на чем. */
    | "TOO_FEW_RESPONSES"
    /** Верный вариант не выбрал никто: сравнивать дистракторы не с чем. */
    | "NO_CORRECT_RESPONSES";

export type OptionStat = {
    /** Ключ варианта, как он лежит в options: 'a', 'b', … */
    option: string;
    isCorrect: boolean;
    count: number;
    /** Доля от ОТВЕТИВШИХ, не от всех сдававших. 0…1. */
    share: number;
    /** Средняя θ выбравших. null — не выбрал никто. */
    meanTheta: number | null;
    flags: DistractorFlag[];
};

export type QuestionDistractorReport = {
    questionId: string;
    /** Сколько человек выбрали хоть что-то. */
    respondents: number;
    /** Сколько не ответили. */
    omitted: number;
    correctOptions: string[];
    /** Средняя θ выбравших верный вариант. null — таких нет. */
    correctMeanTheta: number | null;
    options: OptionStat[];
    /** Сводные флаги задания: объединение флагов его вариантов. */
    flags: DistractorFlag[];
    /**
     * Выборы, которых нет среди вариантов задания. Должно быть 0; ненулевое
     * значит, что ответы и вариант разошлись, — молчать об этом нельзя.
     */
    unknownSelections: number;
    status: QuestionStatus;
};

/** Один ответ одного ученика на одно задание. */
export type DistractorResponse = {
    /** Способность ученика. null — не посчитана, ответ в средние не идёт. */
    theta: number | null;
    /** Что выбрано. Пустой массив — не ответил. */
    selected: string[];
};

/**
 * Разбор ответов из того вида, в котором они лежат в mock_answer_details.
 *
 * `selected_answer` хранит разное: у одиночного выбора это буква ('a'), у
 * множественного — JSON-массив ('["a","c"]'), а неотвеченное submit_mock
 * пишет ЛИТЕРАЛОМ 'null' (066_admin_free_mock.sql), а не NULL-ом. Все три
 * случая разбираются здесь, чтобы дальше работать с одним типом.
 */
export function parseSelection(raw: string | null | undefined): string[] {
    if (raw === null || raw === undefined) return [];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "null") return [];
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed === null) return [];
        if (Array.isArray(parsed)) {
            return parsed
                .filter((v) => typeof v === "string" || typeof v === "number")
                .map((v) => String(v).trim())
                .filter((v) => v !== "");
        }
        if (typeof parsed === "string") return parsed.trim() === "" ? [] : [parsed.trim()];
        // Числу или объекту тут взяться неоткуда, но если взялось — это не
        // выбор варианта, и подставлять его как вариант нельзя.
        return [];
    } catch {
        // Не JSON — значит обычная буква варианта.
        return [trimmed];
    }
}

const mean = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Разбор одного закрытого задания.
 *
 * `optionKeys` — ВСЕ варианты задания, включая невыбранные: без них
 * DEAD_DISTRACTOR не обнаружить, ведь ненайденного варианта в ответах нет по
 * определению.
 *
 * `correctOptions` — ключ задания. У одиночного выбора один элемент, у
 * множественного несколько; верным считается выбор любого из них, поэтому
 * средняя «верных» пулится по всем. Для одиночного выбора это в точности
 * «средняя θ выбравших правильный ответ».
 */
export function analyzeQuestion(
    questionId: string,
    optionKeys: readonly string[],
    correctOptions: readonly string[],
    responses: readonly DistractorResponse[],
): QuestionDistractorReport {
    const correctSet = new Set(correctOptions);
    const known = new Set(optionKeys);

    const thetasByOption = new Map<string, number[]>();
    const countByOption = new Map<string, number>();
    optionKeys.forEach((key) => {
        thetasByOption.set(key, []);
        countByOption.set(key, 0);
    });

    let respondents = 0;
    let omitted = 0;
    let unknownSelections = 0;
    const correctThetas: number[] = [];

    for (const response of responses) {
        if (response.selected.length === 0) {
            omitted++;
            continue;
        }
        respondents++;
        // Один ученик может попасть в несколько вариантов — так устроен
        // множественный выбор. Доли при этом в сумме дадут больше 100%, и это
        // правда о задании, а не ошибка счёта.
        let countedCorrect = false;
        for (const choice of response.selected) {
            if (!known.has(choice)) {
                unknownSelections++;
                continue;
            }
            countByOption.set(choice, (countByOption.get(choice) ?? 0) + 1);
            if (response.theta !== null && Number.isFinite(response.theta)) {
                thetasByOption.get(choice)!.push(response.theta);
                if (correctSet.has(choice) && !countedCorrect) {
                    // Один ученик — один вклад в «средняя θ верных», даже если
                    // он отметил оба верных варианта.
                    correctThetas.push(response.theta);
                    countedCorrect = true;
                }
            }
        }
    }

    const correctMeanTheta = mean(correctThetas);

    // ═══ Флаги ставятся только там, где задание вообще измерялось ═══
    //
    // Без этого условия «вариант не выбрал никто» срабатывает на задании, где
    // никто не ответил вовсе, — а это находка про охват, не про вариант.
    //
    // Проверено на проде и оказалось решающим: из 61 задания с мёртвым
    // дистрактором 43 имели НОЛЬ ответивших и ещё 17 — меньше десяти.
    // Настоящей находкой был ровно один вариант (52 ответивших, не выбрал
    // никто). Без гейта отчёт на 60 ложных срабатываний скрыл бы её.
    //
    // Причина, по которой задание не измерялось, остаётся в status —
    // TOO_FEW_RESPONSES, — то есть она видна, а не проглочена (§233).
    const measured = respondents >= MIN_QUESTION_RESPONSES;

    const options: OptionStat[] = optionKeys.map((key) => {
        const count = countByOption.get(key) ?? 0;
        const meanTheta = mean(thetasByOption.get(key) ?? []);
        const isCorrect = correctSet.has(key);
        const flags: DistractorFlag[] = [];

        if (measured && !isCorrect && count === 0) flags.push("DEAD_DISTRACTOR");
        if (
            measured
            && !isCorrect
            && meanTheta !== null
            && correctMeanTheta !== null
            && meanTheta > correctMeanTheta
        ) {
            flags.push("OUTPERFORMS_CORRECT");
            // Помечаем, но НЕ убираем флаг выше: сигнал на малой выборке
            // остаётся сигналом, просто читать его надо со счётчиком в руках.
            if (count < MIN_OPTION_RESPONSES) flags.push("LOW_COUNT");
        }

        return {
            option: key,
            isCorrect,
            count,
            share: respondents === 0 ? 0 : count / respondents,
            meanTheta,
            flags,
        };
    });

    const status: QuestionStatus = respondents < MIN_QUESTION_RESPONSES
        ? "TOO_FEW_RESPONSES"
        : correctMeanTheta === null
            ? "NO_CORRECT_RESPONSES"
            : "OK";

    return {
        questionId,
        respondents,
        omitted,
        correctOptions: [...correctOptions],
        correctMeanTheta,
        options,
        flags: Array.from(new Set(options.flatMap((o) => o.flags))),
        unknownSelections,
        status,
    };
}

/** Закрытое ли задание: у открытого вариантов нет по определению. */
export function isClosedQuestion(optionKeys: readonly string[]): boolean {
    return optionKeys.length >= 2;
}

/**
 * Ключ задания из данных банка.
 *
 * `answer_key.values` главнее `correct_answer`: у множественного выбора верных
 * вариантов несколько, и в `correct_answer` помещается только первый. На проде
 * это видно буквально — у единственного multiple_choice `answer_key.values` =
 * ["b","d"], а `correct_answer` = "b". Считать «d» дистрактором значило бы
 * пометить верный вариант как ошибку ключа.
 */
export function correctOptionsFor(
    correctAnswer: string | null | undefined,
    answerKey: { values?: unknown } | null | undefined,
): string[] {
    const values = answerKey?.values;
    if (Array.isArray(values)) {
        const parsed = values
            .filter((v) => typeof v === "string" || typeof v === "number")
            .map((v) => String(v).trim())
            .filter((v) => v !== "");
        if (parsed.length > 0) return parsed;
    }
    const single = (correctAnswer ?? "").trim();
    return single === "" ? [] : [single];
}
