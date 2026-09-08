// Статусы ответа и политика пропусков — ТЗ §A.3–A.4.
//
// Чистая логика, без сети и БД: решение «пропуск это ноль или это отсутствие
// данных» слишком важно, чтобы жить внутри роута (см. CLAUDE.md, «Тесты»).
//
// ЗАЧЕМ. Сейчас всё неотвеченное уходит в модель как неверный ответ. На проде
// это 636 ответов из 4700, и 501 из них — ХВОСТОВЫЕ: ученик не дошёл до конца.
// Модель читает это как «пытался и не смог», то есть завышает сложность
// последних заданий и занижает способность тех, кому не хватило времени.
//
// Норма различает четыре состояния (§73) и требует разной обработки:
//
//   при КАЛИБРОВКЕ заданий  — пропуск это missing, а не ноль (§A.3);
//   при выдаче балла ученику — пропуск не даёт баллов, это политика
//                              оценивания, а не свойство модели.
//
// Отсюда явный флаг missing_policy, которого норма и требует.

export type ResponseState =
    /** Ответ дан и верен. */
    | "CORRECT"
    /** Ответ дан и неверен. */
    | "INCORRECT"
    /** Ответа нет, но дальше по варианту ученик отвечал — значит пропустил осознанно. */
    | "OMITTED"
    /** Ответа нет, и дальше тоже ничего — не дошёл (§A.4). */
    | "NOT_REACHED";

export type MissingPolicy =
    /** Балл ученику: пропуск не даёт баллов. */
    | "EXAM"
    /** Оценка сложностей: пропуск исключается из likelihood. */
    | "CALIBRATION";

export const MISSING_STATES: readonly ResponseState[] = ["OMITTED", "NOT_REACHED"];

export function isMissing(state: ResponseState): boolean {
    return state === "OMITTED" || state === "NOT_REACHED";
}

// Разметка ответов ОДНОЙ работы. Порядок обязателен: NOT_REACHED определяется
// только положением, а не самим ответом.
//
// Правило: пропуски в хвосте — NOT_REACHED, пропуски до последнего отвеченного
// задания — OMITTED. Это самый консервативный способ различить их без
// временных меток: ученик, ответивший на задание №40, до №39 дошёл заведомо.
//
// Полностью пустая работа целиком NOT_REACHED: отвеченного нет, значит нет и
// доказательства, что человек хоть куда-то дошёл. При калибровке она выпадает
// вся — и это правильно, вклад в оценку сложностей у неё нулевой.
export function classifyResponses(
    ordered: ReadonlyArray<{ answered: boolean; correct: boolean }>,
): ResponseState[] {
    let lastAnswered = -1;
    for (let i = 0; i < ordered.length; i++) {
        if (ordered[i].answered) lastAnswered = i;
    }
    return ordered.map((r, i) => {
        if (r.answered) return r.correct ? "CORRECT" : "INCORRECT";
        return i > lastAnswered ? "NOT_REACHED" : "OMITTED";
    });
}

// Что уходит в модель при выбранной политике.
//
//   0 или 1 — наблюдение;
//   null    — наблюдения нет, строку в likelihood НЕ добавлять.
//
// Возвращать здесь 0 вместо null было бы той самой ошибкой, которую §A.3
// запрещает: «не кормить их в likelihood как 0».
export function responseForModel(state: ResponseState, policy: MissingPolicy): 0 | 1 | null {
    if (state === "CORRECT") return 1;
    if (state === "INCORRECT") return 0;
    // OMITTED / NOT_REACHED
    return policy === "EXAM" ? 0 : null;
}

export type StateCounts = Record<ResponseState, number>;

export function countStates(states: ReadonlyArray<ResponseState>): StateCounts {
    const counts: StateCounts = { CORRECT: 0, INCORRECT: 0, OMITTED: 0, NOT_REACHED: 0 };
    for (const s of states) counts[s]++;
    return counts;
}
