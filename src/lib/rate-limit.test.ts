import { describe, it, expect } from "vitest";
import { requestIp } from "./rate-limit";

// Только requestIp — чистый разбор заголовков. checkRateLimit сам по себе
// вызывает RPC через SupabaseClient (сеть/БД), а в проекте нет прецедента
// мокать SupabaseClient в unit-тестах (CLAUDE.md: тесты — только для чистой
// логики без сети/БД) — заводить такой мок ради одной функции не по конвенции.
describe("requestIp", () => {
    it("takes the first IP from x-forwarded-for", () => {
        const req = new Request("https://example.com", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
        expect(requestIp(req)).toBe("1.2.3.4");
    });

    it("trims whitespace around the first IP", () => {
        const req = new Request("https://example.com", { headers: { "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" } });
        expect(requestIp(req)).toBe("1.2.3.4");
    });

    it("falls back to x-real-ip when x-forwarded-for is absent", () => {
        const req = new Request("https://example.com", { headers: { "x-real-ip": "9.9.9.9" } });
        expect(requestIp(req)).toBe("9.9.9.9");
    });

    it("prefers x-forwarded-for over x-real-ip when both are present", () => {
        const req = new Request("https://example.com", {
            headers: { "x-forwarded-for": "1.2.3.4", "x-real-ip": "9.9.9.9" },
        });
        expect(requestIp(req)).toBe("1.2.3.4");
    });

    it("returns \"unknown\" when neither header is present", () => {
        const req = new Request("https://example.com");
        expect(requestIp(req)).toBe("unknown");
    });
});
