import { describe, it, expect } from "vitest";
import { evaluatePaymentCreation, evaluatePaymentConfirmation } from "./payment-rules";

describe("evaluatePaymentCreation", () => {
    it("rejects non-paid test types", () => {
        const result = evaluatePaymentCreation({ testType: "free", hasExistingAccess: false });
        expect(result.action).toBe("reject");
    });

    it("rejects when the user already has access", () => {
        const result = evaluatePaymentCreation({ testType: "paid", hasExistingAccess: true });
        expect(result.action).toBe("reject");
    });

    it("allows creating a payment when nothing blocks it", () => {
        const result = evaluatePaymentCreation({ testType: "paid", hasExistingAccess: false });
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
