// Pure decision logic extracted from the payment API routes
// (src/app/api/payments/create/route.ts, src/app/api/payments/mock-confirm/route.ts)
// so it's testable without mocking Supabase — Группа 10, задача 43.
// The routes themselves stay the source of truth for I/O; this module only
// decides WHAT to do given already-fetched facts.

export type PaymentCreationDecision =
    | { action: "reject"; reason: string }
    | { action: "reuse_pending"; paymentId: string }
    | { action: "create" };

export function evaluatePaymentCreation(input: {
    testType: string;
    hasExistingAccess: boolean;
    pendingPaymentId: string | null;
}): PaymentCreationDecision {
    if (input.testType !== "paid") {
        return { action: "reject", reason: "Этот тест не требует оплаты" };
    }
    if (input.hasExistingAccess) {
        return { action: "reject", reason: "У вас уже есть доступ к этому тесту" };
    }
    if (input.pendingPaymentId) {
        return { action: "reuse_pending", paymentId: input.pendingPaymentId };
    }
    return { action: "create" };
}

export type PaymentConfirmationDecision =
    | { action: "reject"; httpStatus: number; reason: string }
    | { action: "already_resolved"; status: string }
    | { action: "cancel" }
    | { action: "confirm_success" };

export function evaluatePaymentConfirmation(input: {
    paymentOwnerId: string;
    paymentStatus: string;
    requestingUserId: string;
    outcome: "success" | "cancelled";
}): PaymentConfirmationDecision {
    if (input.paymentOwnerId !== input.requestingUserId) {
        return { action: "reject", httpStatus: 403, reason: "Не авторизован" };
    }
    if (input.paymentStatus !== "pending") {
        return { action: "already_resolved", status: input.paymentStatus };
    }
    if (input.outcome === "cancelled") {
        return { action: "cancel" };
    }
    return { action: "confirm_success" };
}
