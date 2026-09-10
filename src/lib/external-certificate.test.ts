import { describe, it, expect } from "vitest";
import {
    validateCertificate,
    isUsableForLinking,
    CERTIFICATE_MIN_SCORE,
    CERTIFICATE_LEVELS,
} from "./external-certificate";
import { gradeLevelFromScore } from "./mock-grade-level";
import { certificateMinScoreFor } from "./external-certificate";
import { certificateMaxForSubject } from "./certificate-scale";

// Математика — шкала 100 (решение владельца от 2026-09-10), английский — 75.
// Пороги масштабируются вместе со шкалой, поэтому у сертификата по математике
// они сотенные, а у английского остались официальные 46/50/…/70.
const MATH_MAX = certificateMaxForSubject("math");        // 100
const MATH_MIN = certificateMinScoreFor("math");          // порог C на сотне
const base = { subjectId: "math", score: 80, issuedAt: "2026-06-15" };

describe("проверка заявленных данных", () => {
    it("корректная запись проходит и отдаёт уровень по баллу", () => {
        // 80 из 100 — это ровно порог B+ на сотенной шкале.
        const result = validateCertificate(base);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.levelFromScore).toBe("B+");
            expect(result.levelMatches).toBe(true);
        }
    });

    it("шкала предметная: тот же балл у английского даёт другой уровень", () => {
        // 80 из 75 не бывает — отвергается; а 60 из 75 у английского это B+,
        // тогда как 60 из 100 у математики — «Ниже C».
        expect(validateCertificate({ ...base, subjectId: "english" }).ok).toBe(false);
        const eng = validateCertificate({ subjectId: "english", score: 60, issuedAt: "2026-06-15" });
        expect(eng.ok).toBe(true);
        if (eng.ok) expect(eng.levelFromScore).toBe("B+");
        const math = validateCertificate({ ...base, score: 60 });
        expect(math.ok).toBe(false);   // 60 из 100 ниже порога C (61,3)
    });

    it("балл ниже порога C отвергается — с таким сертификат не выдаётся (§0.3)", () => {
        // Порог тоже масштабируется: на сотне это 61,3, а не 46. Оставь здесь
        // 46 — и сертификат по математике на 55 из 100 (ниже C) прошёл бы.
        expect(validateCertificate({ ...base, score: MATH_MIN - 0.1 }).ok).toBe(false);
        expect(validateCertificate({ ...base, score: MATH_MIN }).ok).toBe(true);
        // На шкале 75 порог остался официальным.
        expect(certificateMinScoreFor("english")).toBe(CERTIFICATE_MIN_SCORE);
        expect(MATH_MIN).toBeCloseTo(61.33, 1);
    });

    it("балл выше шкалы отвергается — у каждого предмета своей", () => {
        expect(validateCertificate({ ...base, score: MATH_MAX + 0.1 }).ok).toBe(false);
        expect(validateCertificate({ ...base, score: MATH_MAX }).ok).toBe(true);
        // Английскому 100 не бывает: его максимум 75.
        expect(validateCertificate({ subjectId: "english", score: 100, issuedAt: "2026-06-15" }).ok).toBe(false);
        expect(validateCertificate({ subjectId: "english", score: 75, issuedAt: "2026-06-15" }).ok).toBe(true);
    });

    it("below_c не бывает уровнем сертификата", () => {
        expect(CERTIFICATE_LEVELS).not.toContain("below_c");
        const result = validateCertificate({ ...base, level: "below_c" });
        expect(result.ok).toBe(false);
    });

    it("пороги берутся те же, что у наших моков", () => {
        // §L.3 и §R.4: границы заданы государством. Своя копия порогов здесь
        // однажды разошлась бы с основной, поэтому сверяемся с той же
        // функцией — но на шкале ЭТОГО предмета.
        for (const score of [61.4, 66.7, 73.4, 80, 86.7, 93.4, 99.9]) {
            const result = validateCertificate({ ...base, score });
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.levelFromScore).toBe(gradeLevelFromScore(score, { max: MATH_MAX }));
        }
    });

    it("несовпадение уровня с баллом НЕ отвергается, а помечается", () => {
        // На документе напечатано и то и другое. Расхождение — находка про
        // документ или про ввод, а не повод запретить запись.
        const result = validateCertificate({ ...base, score: 80, level: "A" });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.levelMatches).toBe(false);
            expect(result.levelFromScore).toBe("B+");   // 80 из 100
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
