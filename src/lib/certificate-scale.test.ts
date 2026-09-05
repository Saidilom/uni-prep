import { describe, it, expect } from "vitest";
import {
    certificateMaxForSubject,
    tScoreToCertificate,
    certificatePercent,
    CERTIFICATE_MAX_ENGLISH,
    CERTIFICATE_MAX_GENERAL,
} from "./certificate-scale";

describe("certificateMaxForSubject", () => {
    it("иностранные языки остаются на 75", () => {
        expect(certificateMaxForSubject("english")).toBe(CERTIFICATE_MAX_ENGLISH);
        expect(CERTIFICATE_MAX_ENGLISH).toBe(75);
    });

    it("все общеобразовательные предметы — 100", () => {
        for (const subject of ["math", "physics", "chemistry", "biology", "history", "geography", "native", "uzbek", "russian"]) {
            expect(certificateMaxForSubject(subject)).toBe(CERTIFICATE_MAX_GENERAL);
        }
        expect(CERTIFICATE_MAX_GENERAL).toBe(100);
    });

    it("предмет без указания считается общеобразовательным", () => {
        // Безопаснее ошибиться в сторону 100: моков без subject_id на проде нет,
        // но отдать такому английскую шкалу было бы страннее.
        expect(certificateMaxForSubject(null)).toBe(100);
        expect(certificateMaxForSubject(undefined)).toBe(100);
    });
});

describe("tScoreToCertificate", () => {
    it("английский отдаёт T как есть", () => {
        expect(tScoreToCertificate(75, "english")).toBe(75);
        expect(tScoreToCertificate(50, "english")).toBe(50);
        expect(tScoreToCertificate(0, "english")).toBe(0);
    });

    it("общеобразовательные растягиваются до 100", () => {
        expect(tScoreToCertificate(75, "math")).toBe(100);
        expect(tScoreToCertificate(0, "math")).toBe(0);
        // Пороги уровней на T-шкале — как они выглядят в итоговом балле.
        expect(tScoreToCertificate(70, "math")).toBe(93);   // A+
        expect(tScoreToCertificate(65, "math")).toBe(87);   // A
        expect(tScoreToCertificate(60, "math")).toBe(80);   // B+
        expect(tScoreToCertificate(55, "math")).toBe(73);   // B
        expect(tScoreToCertificate(50, "math")).toBe(67);   // C+
        expect(tScoreToCertificate(46, "math")).toBe(61);   // C
    });

    it("не выходит за границы шкалы", () => {
        expect(tScoreToCertificate(999, "math")).toBe(100);
        expect(tScoreToCertificate(-5, "math")).toBe(0);
        expect(tScoreToCertificate(999, "english")).toBe(75);
        expect(tScoreToCertificate(NaN, "math")).toBe(0);
    });

    it("сохраняет порядок: сильнее по T — выше итог", () => {
        expect(tScoreToCertificate(70, "math")).toBeGreaterThan(tScoreToCertificate(65, "math"));
        // Именно этим пропорция отличается от таблицы блоков поступления
        // (×100/65), где и 65, и 70 дали бы ровно 100.
        expect(tScoreToCertificate(75, "math")).toBeGreaterThan(tScoreToCertificate(70, "math"));
    });
});

describe("certificatePercent", () => {
    it("считает долю от максимума своего предмета", () => {
        // 60 у англичанина и 60 у математика — разные доли.
        expect(certificatePercent(60, 75)).toBe(80);
        expect(certificatePercent(60, 100)).toBe(60);
    });

    it("отдаёт null там, где считать нечего", () => {
        expect(certificatePercent(null, 100)).toBeNull();
        expect(certificatePercent(50, null)).toBeNull();
        expect(certificatePercent(50, 0)).toBeNull();
    });
});
