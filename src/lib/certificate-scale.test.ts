import { describe, it, expect } from "vitest";
import {
    averageCertificateScore,
    certificateMaxForSubject,
    tScoreToCertificate,
    tScoreToCertificateExact,
    certificatePercent,
    formatScore,
    roundScore,
    scoreOnCertificateScale,
    formatScoreWithError,
    formatScoreInterval,
    CERTIFICATE_MAX,
} from "./certificate-scale";
import { MOCK_SUBJECTS } from "./mock-import-schema";
import { gradeLevelFromScore } from "./mock-grade-level";

// Решение владельца от 2026-09-08: «макс 75 во всех предметах» — та же шкала,
// что у модели Раша, и та, на которой заданы пороги уровней (ТЗ §0.3).
describe("certificateMaxForSubject", () => {
    it("одна шкала 75 на все предметы", () => {
        expect(CERTIFICATE_MAX).toBe(75);
        for (const subject of MOCK_SUBJECTS) {
            expect(certificateMaxForSubject(subject)).toBe(75);
        }
    });

    it("предмет без указания получает ту же шкалу", () => {
        expect(certificateMaxForSubject(null)).toBe(75);
        expect(certificateMaxForSubject(undefined)).toBe(75);
    });

    // Сторож смысла шкалы: балл и порог уровня обязаны быть одним числом.
    // На сотенной шкале это разъезжалось — 60.3 из 100 означало «Ниже C»,
    // потому что порог C = 46 задан на T-шкале. Если кто-то вернёт сюда 100,
    // упадёт этот тест, а не ученик.
    it("порог уровня выражен в тех же баллах, что и сам балл", () => {
        expect(tScoreToCertificate(46, "math")).toBe(46);
        expect(tScoreToCertificate(70, "math")).toBe(70);
    });
});

describe("tScoreToCertificate", () => {
    it("отдаёт T как есть — шкалы совпадают", () => {
        for (const subject of ["english", "math", "uzbek", null]) {
            expect(tScoreToCertificate(75, subject)).toBe(75);
            expect(tScoreToCertificate(50, subject)).toBe(50);
            expect(tScoreToCertificate(0, subject)).toBe(0);
        }
    });

    it("пороги уровней видны в самом балле", () => {
        // Ровно то, чего не было на сотенной шкале: балл 46 — это порог C,
        // а не 61.3.
        expect(tScoreToCertificate(70, "math")).toBe(70);   // A+
        expect(tScoreToCertificate(65, "math")).toBe(65);   // A
        expect(tScoreToCertificate(60, "math")).toBe(60);   // B+
        expect(tScoreToCertificate(55, "math")).toBe(55);   // B
        expect(tScoreToCertificate(50, "math")).toBe(50);   // C+
        expect(tScoreToCertificate(46, "math")).toBe(46);   // C
    });

    // Ради чего всё и делалось: балл округляется до одной десятой, а не до
    // целого. Раньше округлений было три — здесь, в raschThetaToT и в
    // combineSectionScores, — и балл выходил целым.
    it("держит одну десятую, а не целое", () => {
        expect(tScoreToCertificate(64.79, "math")).toBe(64.8);
        expect(tScoreToCertificate(51.67, "math")).toBe(51.7);
        expect(tScoreToCertificate(74.878, "math")).toBe(74.9);
        // Второй десятой быть не должно: точность в проекте одна.
        expect(tScoreToCertificate(64.79, "math") * 10 % 1).toBe(0);
    });

    it("различает T, которые прежде сливались в один балл", () => {
        expect(tScoreToCertificate(50.2, "math")).not.toBe(tScoreToCertificate(50.8, "math"));
    });

    it("не выходит за границы шкалы", () => {
        expect(tScoreToCertificate(999, "math")).toBe(75);
        expect(tScoreToCertificate(-5, "math")).toBe(0);
        expect(tScoreToCertificate(999, "english")).toBe(75);
        expect(tScoreToCertificate(NaN, "math")).toBe(0);
    });

    it("сохраняет порядок: сильнее по T — выше итог", () => {
        expect(tScoreToCertificate(70, "math")).toBeGreaterThan(tScoreToCertificate(65, "math"));
        // Именно этим пропорция отличается от таблицы блоков поступления
        // (×93/65), где и 65, и 70 дали бы ровно максимум.
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

describe("scoreOnCertificateScale", () => {
    it("на общей шкале ничего не меняет", () => {
        expect(scoreOnCertificateScale(60, 75)).toBe(60);
        expect(scoreOnCertificateScale(0, 75)).toBe(0);
    });

    it("строку с прежним максимумом 100 приводит к 75", () => {
        // Пока миграция 092 не прошла или кеш отдаёт старую строку, среднее
        // не должно скакать между шкалами.
        expect(scoreOnCertificateScale(100, 100)).toBe(75);
        expect(scoreOnCertificateScale(42.5, 100)).toBeCloseTo(31.875, 6);
    });

    it("отдаёт null там, где считать нечего", () => {
        expect(scoreOnCertificateScale(null, 75)).toBeNull();
        expect(scoreOnCertificateScale(50, null)).toBeNull();
        expect(scoreOnCertificateScale(50, 0)).toBeNull();
    });
});

describe("averageCertificateScore", () => {
    it("возвращает БАЛЛ по шкале 75, а не процент", () => {
        // Раньше здесь был средний процент, и 60 из 75 давало 80. Рядом с
        // баллами из 75 такое среднее читалось как завышенный балл.
        expect(averageCertificateScore([
            { score: 60, max: 75 },
            { score: 40, max: 75 },
        ])).toBe(50);
    });

    it("смешанные максимумы приводит к одной шкале до усреднения", () => {
        // 60/75 остаётся 60, а 100/100 становится 75 — среднее 67.5.
        expect(averageCertificateScore([
            { score: 60, max: 75 },
            { score: 100, max: 100 },
        ])).toBe(67.5);
    });

    it("работы без балла не занижают среднее", () => {
        // Ноль вместо непосчитанной работы уронил бы группу вдвое.
        expect(averageCertificateScore([
            { score: 60, max: 75 },
            { score: null, max: 75 },
        ])).toBe(60);
    });

    it("отличает «нечего считать» от нуля баллов", () => {
        expect(averageCertificateScore([])).toBeNull();
        expect(averageCertificateScore([{ score: null, max: null }])).toBeNull();
        expect(averageCertificateScore([{ score: 0, max: 75 }])).toBe(0);
    });

    it("среднее тоже с десятой", () => {
        // Группа из дробных баллов не должна показывать целое среднее — это та
        // же потеря точности, только уровнем выше.
        expect(averageCertificateScore([
            { score: 49.8, max: 75 },
            { score: 50.5, max: 75 },
            { score: 51.1, max: 75 },
        ])).toBe(50.5);
    });
});

// Балл с погрешностью. Появился из вопроса «почему баллы повторяются»: пока
// рядом не стоит ±, одна десятая читается как «эти двое разные», а на реальном
// моке SE вышла ±3–4 балла и они неразличимы.
describe("formatScoreWithError", () => {
    it("пишет балл и погрешность через ±", () => {
        expect(formatScoreWithError(31.4, 3.9)).toBe("31,4 ± 3,9");
        expect(formatScoreWithError(50, 3.24)).toBe("50,0 ± 3,2");
    });

    it("без погрешности отдаёт просто балл, а не «± null»", () => {
        // У работ, посчитанных до миграции 093, SE в базе нет, и выдумывать её
        // нельзя (§233).
        expect(formatScoreWithError(31.4, null)).toBe("31,4");
        expect(formatScoreWithError(31.4, undefined)).toBe("31,4");
        expect(formatScoreWithError(31.4, Number.NaN)).toBe("31,4");
        expect(formatScoreWithError(31.4, 0)).toBe("31,4");
    });

    it("без балла ничего не пишет", () => {
        expect(formatScoreWithError(null, 3.9)).toBe("");
        expect(formatScoreWithError(undefined, 3.9)).toBe("");
    });
});

describe("formatScoreInterval", () => {
    it("пишет интервал через тире", () => {
        expect(formatScoreInterval({ low: 20.2, high: 35.6 })).toBe("20,2 – 35,6");
    });

    it("на отсутствующем интервале даёт пустую строку", () => {
        expect(formatScoreInterval(null)).toBe("");
    });
});

// §202–203: внутренний расчёт в полной точности, округление только на выводе.
// Отсюда две функции на один перевод, и путать их нельзя.
describe("tScoreToCertificateExact против tScoreToCertificate", () => {
    it("точный не округляет, показной округляет до десятой", () => {
        expect(tScoreToCertificateExact(64.96, "math")).toBeCloseTo(64.96, 10);
        expect(tScoreToCertificate(64.96, "math")).toBe(65);
    });

    it("округлённый есть в точности roundScore от точного", () => {
        for (const t of [0, 12.34, 45.99, 46, 64.949, 64.96, 70.04, 74.999, 75]) {
            expect(tScoreToCertificate(t, "math")).toBe(roundScore(tScoreToCertificateExact(t, "math")));
        }
    });

    it("оба зажимают шкалу", () => {
        expect(tScoreToCertificateExact(999, "math")).toBe(75);
        expect(tScoreToCertificateExact(-5, "math")).toBe(0);
        expect(tScoreToCertificateExact(Number.NaN, "math")).toBe(0);
    });

    // Тот самый случай, ради которого две функции и разведены: округление
    // переносит балл через порог, а точное значение его не достигало.
    it("на 0,05 ниже порога буква и показанный балл расходятся — и это ожидаемо", () => {
        const exact = tScoreToCertificateExact(64.96, "math");
        expect(gradeLevelFromScore(exact)).toBe("B+");        // точное 64.96 < 65
        expect(formatScore(tScoreToCertificate(64.96, "math"))).toBe("65,0"); // показ округлён
        // Буква обязана следовать точному значению, а не показанному.
        expect(gradeLevelFromScore(tScoreToCertificate(64.96, "math"))).toBe("A");
    });
});
