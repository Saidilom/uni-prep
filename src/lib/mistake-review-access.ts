// Кому и по каким мокам виден разбор ошибок.
//
// Решение владельца (09.09.2026): разбор ошибок должен быть доступен ВСЕМ —
// ученику, учителю, админу филиала и супер-админу, — но не по всякому тесту:
//
//   бесплатный мок                  — да;
//   мок, назначенный учителем       — да;
//   платный, купленный учеником     — нет;
//   тест из комплекта «Ойлик»       — нет.
//
// ═══ ПОРЯДОК ПРОВЕРОК ТУТ ГЛАВНОЕ ═══
//
// Месячные тесты — это `class_only`, и они НАЗНАЧЕНЫ классам: на проде из трёх
// class_only-тестов два принадлежат комплекту «Ойлик». Проверь «назначен
// учителем» раньше — и они пройдут как разрешённые, ровно наперекор решению.
//
// Поэтому «Ойлик» отсекается ПЕРВЫМ, до всех остальных правил, и тест на это
// стоит рядом.
//
// ═══ ЧЕГО ЗДЕСЬ НЕТ ═══
//
// Проверки, ЧЕЙ это результат. Она живёт в RLS и в SECURITY DEFINER-функциях:
// ученик видит свой, учитель — своих групп, админ филиала — своего филиала,
// супер-админ — любой. Этот модуль отвечает на другой вопрос: можно ли вообще
// показывать разбор по ЭТОМУ тесту, кому бы он ни принадлежал.

/** Тип мока из mock_tests.type. */
export type MockKind = "free" | "paid" | "class_only";

export type MockReviewSubject = {
    type: MockKind | null;
    /** Принадлежит комплекту «Ойлик» (mock_tests.oylik_set_id). */
    isOylik: boolean;
    /** Назначен учителем — классу или лично ученику. */
    assignedByTeacher: boolean;
};

export type ReviewDenial =
    /** Тест из комплекта «Ойлик». */
    | "OYLIK"
    /** Платный тест, который ученик купил сам, — учитель его не назначал. */
    | "PAID_SELF_PURCHASED"
    /** Тип теста неизвестен: разрешать по умолчанию нельзя. */
    | "UNKNOWN_TYPE";

export type ReviewAccess =
    | { allowed: true }
    | { allowed: false; reason: ReviewDenial };

export function mistakeReviewAccess(mock: MockReviewSubject): ReviewAccess {
    // ПЕРВЫМ делом «Ойлик»: он class_only и назначен классу, поэтому любое
    // другое правило пропустило бы его вперёд.
    if (mock.isOylik) return { allowed: false, reason: "OYLIK" };

    if (mock.type === "free") return { allowed: true };

    // Назначенный учителем — независимо от того, class_only он или платный:
    // учитель дал его группе, значит и разбирать ошибки по нему уместно.
    if (mock.assignedByTeacher) return { allowed: true };

    if (mock.type === "paid") return { allowed: false, reason: "PAID_SELF_PURCHASED" };

    // class_only без назначения и тест без типа. Разрешать «на всякий случай»
    // нельзя: это открыло бы разбор там, где решением он не предусмотрен.
    return { allowed: false, reason: "UNKNOWN_TYPE" };
}

/** Короткая проверка для мест, где причина отказа не нужна. */
export const canReviewMistakes = (mock: MockReviewSubject): boolean =>
    mistakeReviewAccess(mock).allowed;
