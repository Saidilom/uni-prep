import { describe, it, expect } from "vitest";
import {
    validateCertificate,
    isUsableForLinking,
    CERTIFICATE_MIN_SCORE,
    CERTIFICATE_LEVELS,
} from "./external-certificate";
import { gradeLevelFromScore } from "./mock-grade-level";
import { MOCK_SCALE_MAX } from "./rasch";

const base = { subjectId: "math", score: 60, issuedAt: "2026-06-15" };

describe("проверка заявленных данных", () => {
    it("корректная запись проходит и отдаёт уровень по баллу", () => {
        const result = validateCertificate(base);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.levelFromScore).toBe("B+");
            expect(result.levelMatches).toBe(true);
        }
    });

    it("балл ниже 46 отвергается — с таким сертификат не выдаётся (§0.3)", () => {
        const result = validateCertificate({ ...base, score: 45.9 });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toContain("46");
        // А ровно 46 — уже валидно, это нижняя граница уровня C.
        expect(validateCertificate({ ...base, score: CERTIFICATE_MIN_SCORE }).ok).toBe(true);
    });

    it("балл выше шкалы отвергается", () => {
        expect(validateCertificate({ ...base, score: MOCK_SCALE_MAX + 0.1 }).ok).toBe(false);
        expect(validateCertificate({ ...base, score: MOCK_SCALE_MAX }).ok).toBe(true);
    });

    it("below_c не бывает уровнем сертификата", () => {
        expect(CERTIFICATE_LEVELS).not.toContain("below_c");
        const result = validateCertificate({ ...base, level: "below_c" });
        expect(result.ok).toBe(false);
    });

    it("пороги берутся те же, что у наших моков", () => {
        // §L.3 и §R.4: границы заданы государством, они одни для обеих шкал.
        // Своя копия порогов здесь однажды разошлась бы с основной.
        for (const score of [46, 50, 55, 60, 65, 70, 74.9]) {
            const result = validateCertificate({ ...base, score });
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.levelFromScore).toBe(gradeLevelFromScore(score));
        }
    });

    it("несовпадение уровня с баллом НЕ отвергается, а помечается", () => {
        // На документе напечатано и то и другое. Расхождение — находка про
        // документ или про ввод, а не повод запретить запись.
        const result = validateCertificate({ ...base, score: 60, level: "A" });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.levelMatches).toBe(false);
            expect(result.levelFromScore).toBe("B+");
        }
    });

    it("отсутствие уровня не считается расхождением", () => {
        const result = validateCertificate({ ...base, level: null });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.levelMatches).toBe(true);
    });

    it("плохая дата и пустой предмет отвергаются", () => {
        expect(validateCertificate({ ...base, issuedAt: "вчера" }).ok).toBe(false);
        expect(validateCertificate({ ...base, subjectId: "" }).ok).toBe(false);
        expect(validateCertificate({ ...base, score: Number.NaN }).ok).toBe(false);
    });
});

describe("годность для линкинга (§R.2, §E.5)", () => {
    it("неподтверждённая запись не годится, кто бы её ни внёс", () => {
        expect(isUsableForLinking({ verification: "unverified", levelMatches: true })).toBe(false);
    });

    it("подтверждённая годится — подтверждает проверка, а не источник", () => {
        // Самозаявленная и проверенная так же пригодна, как импортированная и
        // проверенная: значение имеет факт сверки с документом.
        expect(isUsableForLinking({ verification: "verified", levelMatches: true })).toBe(true);
    });

    it("подтверждённая с расхождением уровня и балла не годится", () => {
        // Пока не разобрались, какое из двух чисел верное, брать её в
        // калибровку нельзя: шкала подстроится под ошибку.
        expect(isUsableForLinking({ verification: "verified", levelMatches: false })).toBe(false);
    });
});
