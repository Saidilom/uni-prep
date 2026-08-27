import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyClickSignature, amountsMatch, buildClickCheckoutUrl, CLICK_ERROR } from "./click";

describe("verifyClickSignature", () => {
    const secretKey = "test-secret";

    it("verifies a correct Prepare (action=0) signature", () => {
        const params = { clickTransId: "111", serviceId: "222", merchantTransId: "order-1", amount: "50000", action: "0", signTime: "2026-01-01 10:00:00" };
        const source = [params.clickTransId, params.serviceId, secretKey, params.merchantTransId, params.amount, params.action, params.signTime].join("");
        const signString = crypto.createHash("md5").update(source).digest("hex");
        expect(verifyClickSignature({ ...params, signString }, secretKey)).toBe(true);
    });

    it("verifies a correct Complete (action=1) signature, which includes merchant_prepare_id", () => {
        const params = { clickTransId: "111", serviceId: "222", merchantTransId: "order-1", merchantPrepareId: "order-1", amount: "50000", action: "1", signTime: "2026-01-01 10:05:00" };
        const source = [params.clickTransId, params.serviceId, secretKey, params.merchantTransId, params.merchantPrepareId, params.amount, params.action, params.signTime].join("");
        const signString = crypto.createHash("md5").update(source).digest("hex");
        expect(verifyClickSignature({ ...params, signString }, secretKey)).toBe(true);
    });

    it("rejects a tampered signature", () => {
        const params = { clickTransId: "111", serviceId: "222", merchantTransId: "order-1", amount: "50000", action: "0", signTime: "2026-01-01 10:00:00" };
        expect(verifyClickSignature({ ...params, signString: "deadbeef" }, secretKey)).toBe(false);
    });

    it("rejects when the wrong secret key is used to verify", () => {
        const params = { clickTransId: "111", serviceId: "222", merchantTransId: "order-1", amount: "50000", action: "0", signTime: "2026-01-01 10:00:00" };
        const source = [params.clickTransId, params.serviceId, secretKey, params.merchantTransId, params.amount, params.action, params.signTime].join("");
        const signString = crypto.createHash("md5").update(source).digest("hex");
        expect(verifyClickSignature({ ...params, signString }, "different-secret")).toBe(false);
    });
});

describe("amountsMatch", () => {
    it("tolerates decimal string/number float noise", () => {
        expect(amountsMatch(50000, 50000.0)).toBe(true);
        expect(amountsMatch(50000, 49999)).toBe(false);
    });
});

describe("buildClickCheckoutUrl", () => {
    it("builds a my.click.uz checkout URL with the expected params", () => {
        const url = buildClickCheckoutUrl({ serviceId: "222", merchantId: "333", amountUzs: 50000, orderId: "order-1", returnUrl: "https://app.test/return" });
        const parsed = new URL(url);
        expect(parsed.hostname).toBe("my.click.uz");
        expect(parsed.searchParams.get("service_id")).toBe("222");
        expect(parsed.searchParams.get("merchant_id")).toBe("333");
        expect(parsed.searchParams.get("amount")).toBe("50000");
        expect(parsed.searchParams.get("transaction_param")).toBe("order-1");
        expect(parsed.searchParams.get("return_url")).toBe("https://app.test/return");
    });
});

describe("CLICK_ERROR", () => {
    it("SUCCESS is 0 (Click treats 0 as success, not a truthy error)", () => {
        expect(CLICK_ERROR.SUCCESS).toBe(0);
    });
});
