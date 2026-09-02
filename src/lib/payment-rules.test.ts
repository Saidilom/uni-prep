import { describe, it, expect } from "vitest";
import { evaluatePaymentCreation, evaluatePaymentConfirmation } from "./payment-rules";

describe("evaluatePaymentCreation", () => {
    const base = { testType: "paid", testStatus: "published", closedAt: null, endsAt: null, hasExistingAccess: false };
    const now = new Date("2026-08-15T12:00:00Z");

    it("rejects non-paid test types", () => {
        const result = evaluatePaymentCreation({ ...base, testType: "free" });
        expect(result.action).toBe("reject");
    });

    it("rejects when the user already has access", () => {
        const result = evaluatePaymentCreation({ ...base, hasExistingAccess: true });
        expect(result.action).toBe("reject");
    });

    it("rejects a test that isn't published", () => {
        const result = evaluatePaymentCreation({ ...base, testStatus: "draft" });
        expect(result.action).toBe("reject");
    });

    it("rejects a manually closed test", () => {
        const result = evaluatePaymentCreation({ ...base, closedAt: "2026-08-15T10:00:00Z" });
        expect(result.action).toBe("reject");
    });

    it("rejects a test whose scheduled end time has already passed", () => {
        const result = evaluatePaymentCreation({ ...base, endsAt: "2026-08-15T11:00:00Z", now });
        expect(result.action).toBe("reject");
    });

    it("allows a test whose scheduled window hasn't started yet (pre-purchase)", () => {
        const result = evaluatePaymentCreation({ ...base, endsAt: "2026-08-16T11:00:00Z", now });
        expect(result).toEqual({ action: "create" });
    });

    it("allows creating a payment when nothing blocks it", () => {
        const result = evaluatePaymentCreation(base);
        expect(result).toEqual({ action: "create" });
    });
});

describe("evaluatePaymentConfirmation", () => {
    it("rejects confirmation from someone other than the payment's owner", () => {
        const result = evaluatePaymentConfirmation({
            paymentOwnerId: "u1",
            paymentStatus: "pending",
            requestingUserId: "u2",
            outcome: "success",
        });
        expect(result).toEqual({ action: "reject", httpStatus: 403, reason: "Не авторизован" });
    });

    it("treats an already-resolved payment as a no-op, not a re-confirmation", () => {
        const result = evaluatePaymentConfirmation({
            paymentOwnerId: "u1",
            paymentStatus: "success",
            requestingUserId: "u1",
            outcome: "success",
        });
        expect(result).toEqual({ action: "already_resolved", status: "success" });
    });

    it("cancels a pending payment on a cancelled outcome", () => {
        const result = evaluatePaymentConfirmation({
            paymentOwnerId: "u1",
            paymentStatus: "pending",
            requestingUserId: "u1",
            outcome: "cancelled",
        });
        expect(result).toEqual({ action: "cancel" });
    });

    it("confirms success for a pending payment with a success outcome", () => {
        const result = evaluatePaymentConfirmation({
            paymentOwnerId: "u1",
            paymentStatus: "pending",
            requestingUserId: "u1",
            outcome: "success",
        });
        expect(result).toEqual({ action: "confirm_success" });
    });
});
