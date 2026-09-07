import { describe, it, expect } from "vitest";
import {
    averageCertificateScore,
    certificateMaxForSubject,
    tScoreToCertificate,
    certificatePercent,
    formatScore,
    roundScore,
    CERTIFICATE_MAX_ENGLISH,
    CERTIFICATE_MAX_GENERAL,
} from "./certificate-scale";
import { MOCK_SUBJECTS } from "./mock-import-schema";

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

    // Потолок каждого предмета, который можно выбрать при импорте, теперь
    // показывается прямо на экране проверки («Математика · итог до 100»).
    // Список закреплён целиком: добавит кто-нибудь предмет в MOCK_SUBJECTS —
    // тест упадёт и заставит решить, какая у него шкала, а не оставит бейдж
    // молча показывать 100 по умолчанию.
    it("у каждого предмета из MOCK_SUBJECTS потолок задан осознанно", () => {
        const expected: Record<(typeof MOCK_SUBJECTS)[number], number> = {
            math: 100, physics: 100, chemistry: 100, biology: 100,
            geography: 100, history: 100, russian: 100, uzbek: 100,
            it: 100, other: 100,
            english: 75,
        };
        for (const subject of MOCK_SUBJECTS) {
            expect(certificateMaxForSubject(subject)).toBe(expected[subject]);
        }
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
        expect(tScoreToCertificate(70, "math")).toBe(93.3);   // A+
        expect(tScoreToCertificate(65, "math")).toBe(86.7);   // A
        expect(tScoreToCertificate(60, "math")).toBe(80);     // B+
        expect(tScoreToCertificate(55, "math")).toBe(73.3);   // B
        expect(tScoreToCertificate(50, "math")).toBe(66.7);   // C+
        expect(tScoreToCertificate(46, "math")).toBe(61.3);   // C
    });

    // Ради чего всё и делалось: балл округляется до одной десятой, а не до
    // целого. Раньше округлений было три — здесь, в raschThetaToT и в
    // combineSectionScores, — и балл выходил целым.
    it("держит одну десятую, а не целое", () => {
        expect(tScoreToCertificate(64.79, "math")).toBe(86.4);
        expect(tScoreToCertificate(51.67, "math")).toBe(68.9);
        expect(tScoreToCertificate(74.878, "math")).toBe(99.8);
        // Второй десятой быть не должно: точность в проекте одна.
        expect(tScoreToCertificate(64.79, "math") * 10 % 1).toBe(0);
    });

    it("различает T, которые прежде сливались в один балл", () => {
        // Шаг целого T на сотенной шкале — 1,33 балла, поэтому округление до
        // целого делало из разных T один и тот же балл.
        expect(tScoreToCertificate(50.2, "math")).not.toBe(tScoreToCertificate(50.8, "math"));
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

describe("roundScore", () => {
    it("округляет до одной десятой", () => {
        expect(roundScore(86.44)).toBe(86.4);
        expect(roundScore(86.46)).toBe(86.5);
        expect(roundScore(100)).toBe(100);
    });

    it("не отдаёт NaN наружу", () => {
        expect(roundScore(NaN)).toBe(0);
        expect(roundScore(Infinity)).toBe(0);
    });
});

describe("formatScore", () => {
    it("пишет балл с запятой и одной десятой", () => {
        // Запятая, а не точка: так в ru/uz, и так Excel с русской локалью
        // читает значение как ЧИСЛО, а не как текст.
        expect(formatScore(67.8)).toBe("67,8");
        expect(formatScore(100)).toBe("100,0");
        expect(formatScore(0)).toBe("0,0");
    });

    it("не показывает мусор двоичной дроби", () => {
        // Ровно то, что вылезло бы при печати балла сырым: 86.4 в double
        // хранится неточно.
        expect(formatScore(0.1 + 0.2 + 86.1)).toBe("86,4");
        expect(formatScore(86.40000000000001)).toBe("86,4");
    });

    it("на отсутствующем балле даёт пустую строку, а не «0» и не «null»", () => {
        expect(formatScore(null)).toBe("");
        expect(formatScore(undefined)).toBe("");
        expect(formatScore(NaN)).toBe("");
    });
});

describe("certificatePercent", () => {
    it("считает долю от максимума своего предмета", () => {
        // 60 у англичанина и 60 у математика — разные доли.
        expect(certificatePercent(60, 75)).toBe(80);
        expect(certificatePercent(60, 100)).toBe(60);
    });

    it("не округляет: доля идёт и в цвет, и в усреднение", () => {
        // Округли её до целого — и среднее по группе теряло бы точность зря.
        expect(certificatePercent(86.4, 100)).toBeCloseTo(86.4, 10);
        expect(certificatePercent(44.8, 75)).toBeCloseTo(59.7333, 4);
    });

    it("отдаёт null там, где считать нечего", () => {
        expect(certificatePercent(null, 100)).toBeNull();
        expect(certificatePercent(50, null)).toBeNull();
        expect(certificatePercent(50, 0)).toBeNull();
    });
});

describe("averageCertificateScore", () => {
    it("приводит к сотне до усреднения, а не после", () => {
        // Английский 60/75 — это 80, а не 60. Складывай баллы как есть, и
        // среднее вышло бы 65: английская группа выглядела бы слабее только
        // из-за более низкой шкалы.
        expect(averageCertificateScore([
            { score: 60, max: 75 },
            { score: 70, max: 100 },
        ])).toBe(75);
    });

    it("на одних общеобразовательных ничего не меняет", () => {
        expect(averageCertificateScore([
            { score: 80, max: 100 },
            { score: 60, max: 100 },
        ])).toBe(70);
    });

    it("работы без балла не занижают среднее", () => {
        // Ноль вместо непосчитанной работы уронил бы группу вдвое.
        expect(averageCertificateScore([
            { score: 80, max: 100 },
            { score: null, max: 100 },
        ])).toBe(80);
    });

    it("отличает «нечего считать» от нуля баллов", () => {
        expect(averageCertificateScore([])).toBeNull();
        expect(averageCertificateScore([{ score: null, max: null }])).toBeNull();
        expect(averageCertificateScore([{ score: 0, max: 100 }])).toBe(0);
    });

    it("среднее тоже с десятой", () => {
        // Группа из дробных баллов не должна показывать целое среднее — это та
        // же потеря точности, только уровнем выше.
        expect(averageCertificateScore([
            { score: 66.4, max: 100 },
            { score: 67.3, max: 100 },
            { score: 68.1, max: 100 },
        ])).toBe(67.3);
    });
});
