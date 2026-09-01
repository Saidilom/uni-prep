// Pure decision logic extracted from the payment API routes
// (src/app/api/payments/create/route.ts, src/app/api/payments/mock-confirm/route.ts)
// so it's testable without mocking Supabase — Группа 10, задача 43.
// The routes themselves stay the source of truth for I/O; this module only
// decides WHAT to do given already-fetched facts.

export type PaymentCreationDecision =
    | { action: "reject"; reason: string }
    | { action: "create" };

// Deciding "reuse an existing pending payment vs. create a new one" used to
// live here too, based on a pre-fetched snapshot — but that snapshot could
// go stale between the check and the insert (two near-simultaneous requests
// both seeing "no pending payment yet"), so that decision now happens
// atomically in the database itself (get_or_create_pending_payment,
// 045_atomic_pending_payment.sql) instead of being made from a stale read
// here. This function only ever needs to decide whether to allow a payment
// attempt at all.
export function evaluatePaymentCreation(input: {
    testType: string;
    hasExistingAccess: boolean;
}): PaymentCreationDecision {
    if (input.testType !== "paid") {
        return { action: "reject", reason: "Этот тест не требует оплаты" };
    }
    if (input.hasExistingAccess) {
        return { action: "reject", reason: "У вас уже есть доступ к этому тесту" };
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
