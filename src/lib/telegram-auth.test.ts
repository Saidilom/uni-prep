import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import { isValidTelegramPayload, verifyTelegramSignature, isTelegramAuthDateFresh, TelegramAuthPayload } from "./telegram-auth";

const BOT_TOKEN = "123456789:AAtest-bot-token-not-real";

// Тот же алгоритм, что и в проверяемом коде, но собран независимо от него —
// иначе тест доказывал бы только то, что функция согласна сама с собой.
function signPayload(fields: Omit<TelegramAuthPayload, "hash">, botToken: string): TelegramAuthPayload {
    const dataCheckString = Object.keys(fields)
        .sort()
        .map((key) => `${key}=${(fields as Record<string, unknown>)[key]}`)
        .join("\n");
    const secretKey = crypto.createHash("sha256").update(botToken).digest();
    const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    return { ...fields, hash };
}

describe("verifyTelegramSignature", () => {
    const base = { id: 123456789, first_name: "Ali", auth_date: 1_757_800_000 };

    it("accepts a correctly signed payload", () => {
        const payload = signPayload(base, BOT_TOKEN);
        expect(verifyTelegramSignature(payload, BOT_TOKEN)).toBe(true);
    });

    it("rejects a payload signed with a different bot token", () => {
        const payload = signPayload(base, BOT_TOKEN);
        expect(verifyTelegramSignature(payload, "999999999:other-bot-token")).toBe(false);
    });

    it("rejects a tampered field (id changed after signing)", () => {
        const payload = signPayload(base, BOT_TOKEN);
        expect(verifyTelegramSignature({ ...payload, id: 999999999 }, BOT_TOKEN)).toBe(false);
    });

    it("rejects a tampered first_name", () => {
        const payload = signPayload(base, BOT_TOKEN);
        expect(verifyTelegramSignature({ ...payload, first_name: "Eve" }, BOT_TOKEN)).toBe(false);
    });

    it("rejects a garbage hash of the wrong length instead of throwing", () => {
        const payload = signPayload(base, BOT_TOKEN);
        // timingSafeEqual бросает на буферах разной длины — verifyTelegramSignature
        // обязана поймать это ДО вызова, а не дать исключению всплыть наружу.
        expect(() => verifyTelegramSignature({ ...payload, hash: "ab" }, BOT_TOKEN)).not.toThrow();
        expect(verifyTelegramSignature({ ...payload, hash: "ab" }, BOT_TOKEN)).toBe(false);
    });

    it("rejects a same-length but wrong hash", () => {
        const payload = signPayload(base, BOT_TOKEN);
        const flippedHash = payload.hash.slice(0, -1) + (payload.hash.at(-1) === "0" ? "1" : "0");
        expect(verifyTelegramSignature({ ...payload, hash: flippedHash }, BOT_TOKEN)).toBe(false);
    });

    it("includes optional fields (last_name, username, photo_url) in the signed data", () => {
        const withExtra = { ...base, last_name: "Valiyev", username: "ali_v", photo_url: "https://t.me/photo.jpg" };
        const payload = signPayload(withExtra, BOT_TOKEN);
        expect(verifyTelegramSignature(payload, BOT_TOKEN)).toBe(true);
        // Тот же payload, но подписанный без photo_url в data_check_string —
        // подпись обязана не совпасть: optional-поля реально должны входить
        // в проверяемые данные, а не игнорироваться молча.
        const signedWithoutPhoto = signPayload({ ...base, last_name: "Valiyev", username: "ali_v" }, BOT_TOKEN);
        expect(verifyTelegramSignature({ ...payload, hash: signedWithoutPhoto.hash }, BOT_TOKEN)).toBe(false);
    });
});

describe("isValidTelegramPayload", () => {
    it("accepts a well-formed payload", () => {
        expect(isValidTelegramPayload({ id: 1, first_name: "A", auth_date: 1, hash: "abcd" })).toBe(true);
    });

    it("rejects non-objects", () => {
        expect(isValidTelegramPayload(null)).toBe(false);
        expect(isValidTelegramPayload(undefined)).toBe(false);
        expect(isValidTelegramPayload("string")).toBe(false);
        expect(isValidTelegramPayload(42)).toBe(false);
    });

    it("rejects a payload missing required fields", () => {
        expect(isValidTelegramPayload({ first_name: "A", auth_date: 1, hash: "abcd" })).toBe(false);
        expect(isValidTelegramPayload({ id: 1, auth_date: 1, hash: "abcd" })).toBe(false);
        expect(isValidTelegramPayload({ id: 1, first_name: "A", hash: "abcd" })).toBe(false);
        expect(isValidTelegramPayload({ id: 1, first_name: "A", auth_date: 1 })).toBe(false);
    });

    it("rejects a payload with wrong field types (id as string)", () => {
        expect(isValidTelegramPayload({ id: "1", first_name: "A", auth_date: 1, hash: "abcd" })).toBe(false);
    });
});

describe("isTelegramAuthDateFresh", () => {
    it("accepts a request signed right now", () => {
        expect(isTelegramAuthDateFresh(1000, 1000, 60)).toBe(true);
    });

    it("accepts a request right at the edge of the window", () => {
        expect(isTelegramAuthDateFresh(1000, 1060, 60)).toBe(true);
    });

    it("rejects a request one second past the window (replay protection)", () => {
        expect(isTelegramAuthDateFresh(1000, 1061, 60)).toBe(false);
    });

    it("rejects a request that is far in the past", () => {
        expect(isTelegramAuthDateFresh(1000, 100000, 60)).toBe(false);
    });
});
