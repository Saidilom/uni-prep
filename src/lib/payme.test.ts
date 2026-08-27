import { describe, it, expect } from "vitest";
import { amountToTiyin, tiyinToAmount, verifyPaymeAuth, buildPaymeCheckoutUrl } from "./payme";

describe("amountToTiyin / tiyinToAmount", () => {
    it("converts UZS to tiyin and back", () => {
        expect(amountToTiyin(50000)).toBe(5000000);
        expect(tiyinToAmount(5000000)).toBe(50000);
    });

    it("rounds fractional tiyin", () => {
        expect(amountToTiyin(50000.005)).toBe(5000001);
    });
});

describe("verifyPaymeAuth", () => {
    const key = "test-merchant-key";
    const validHeader = `Basic ${Buffer.from(`Paycom:${key}`).toString("base64")}`;

    it("accepts a correctly-encoded key regardless of the login part", () => {
        expect(verifyPaymeAuth(validHeader, key)).toBe(true);
        expect(verifyPaymeAuth(`Basic ${Buffer.from(`anything:${key}`).toString("base64")}`, key)).toBe(true);
    });

    it("rejects a wrong key", () => {
        expect(verifyPaymeAuth(`Basic ${Buffer.from(`Paycom:wrong-key`).toString("base64")}`, key)).toBe(false);
    });

    it("rejects missing or malformed headers", () => {
        expect(verifyPaymeAuth(null, key)).toBe(false);
        expect(verifyPaymeAuth("Bearer sometoken", key)).toBe(false);
        expect(verifyPaymeAuth("Basic not-base64!!!", key)).toBe(false);
    });
});

describe("buildPaymeCheckoutUrl", () => {
    it("builds a checkout.paycom.uz URL with base64-encoded order params", () => {
        const url = buildPaymeCheckoutUrl({ merchantId: "abc123", orderId: "order-1", amountUzs: 50000 });
        expect(url).toMatch(/^https:\/\/checkout\.paycom\.uz\//);
        const encoded = url.split("/").pop()!;
        const decoded = Buffer.from(encoded, "base64").toString("utf8");
        expect(decoded).toBe("m=abc123;ac.order_id=order-1;a=5000000");
    });

    it("uses the sandbox host in test mode and appends the return url", () => {
        const url = buildPaymeCheckoutUrl({ merchantId: "abc123", orderId: "order-1", amountUzs: 1000, returnUrl: "https://app.test/return", testMode: true });
        expect(url).toMatch(/^https:\/\/checkout\.test\.paycom\.uz\//);
        const decoded = Buffer.from(url.split("/").pop()!, "base64").toString("utf8");
        expect(decoded).toBe("m=abc123;ac.order_id=order-1;a=100000;c=https://app.test/return");
    });
});
