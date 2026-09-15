import { describe, it, expect } from "vitest";
import { isSyntheticTelegramEmail } from "./auth-utils";

describe("isSyntheticTelegramEmail", () => {
    it("recognizes a synthetic Telegram email", () => {
        expect(isSyntheticTelegramEmail("tg_123456789@telegram.registan.local")).toBe(true);
    });

    it("rejects a real email", () => {
        expect(isSyntheticTelegramEmail("student@gmail.com")).toBe(false);
    });

    it("rejects null and undefined without throwing", () => {
        expect(isSyntheticTelegramEmail(null)).toBe(false);
        expect(isSyntheticTelegramEmail(undefined)).toBe(false);
    });

    it("rejects an empty string", () => {
        expect(isSyntheticTelegramEmail("")).toBe(false);
    });

    it("rejects a look-alike domain that only contains the suffix as a substring, not at the end", () => {
        expect(isSyntheticTelegramEmail("tg_1@telegram.registan.local.evil.com")).toBe(false);
    });

    it("rejects a domain that merely resembles the synthetic one", () => {
        expect(isSyntheticTelegramEmail("someone@telegram.registan.local.com")).toBe(false);
        expect(isSyntheticTelegramEmail("someone@notthesamedomain.local")).toBe(false);
    });
});
