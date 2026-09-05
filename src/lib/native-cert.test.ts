import { describe, it, expect } from "vitest";
import { essay24ToScore75, essayPointsToScore75, combineSectionScores, isNativeCertSubject } from "./native-cert";

// Все строки таблицы из Baholash_mezoni.pdf (стр. 3-4), перенесённые сюда
// независимо от самого модуля. Если при переносе таблицы в native-cert.ts
// проскочит опечатка, разойдётся именно здесь.
const DOCUMENT_TABLE: Array<[number, number]> = [
    [24, 75], [23.5, 74], [23, 73], [22.5, 72], [22, 71], [21.5, 70], [21, 69], [20.5, 68],
    [20, 67], [19.5, 66], [19, 65], [18.5, 64], [18, 63], [17.5, 62], [17, 61], [16.5, 60],
    [16, 59], [15.5, 58], [15, 57], [14.5, 56], [14, 55], [13.5, 54], [13, 53], [12.5, 52],
    [12, 51], [11.5, 50], [11, 49], [10.5, 48], [10, 47], [9.5, 46], [9, 45], [8.5, 44],
    [8, 43], [7.5, 42], [7, 41], [6.5, 40], [6, 39], [5.5, 38], [5, 37], [4.5, 36],
    [4, 35], [3.5, 34], [3, 33], [2.5, 32], [2, 31], [1.5, 30], [1, 29], [0.5, 28],
];

describe("essay24ToScore75", () => {
    it("совпадает с таблицей документа во всех 48 строках", () => {
        for (const [points, expected] of DOCUMENT_TABLE) {
            expect(essay24ToScore75(points)).toBe(expected);
        }
    });

    it("внутри таблица линейна: 2·балл + 27", () => {
        // Ловит опечатку переноса, которая случайно попала бы в обе копии.
        for (const [points, expected] of DOCUMENT_TABLE) {
            expect(expected).toBe(2 * points + 27);
        }
    });

    it("ноль стоит особняком: 0 → 0, а не 27", () => {
        // В документе 0,5 → 28, но 0 → 0. Разрыв намеренный.
        expect(essay24ToScore75(0)).toBe(0);
        expect(essay24ToScore75(-1)).toBe(0);
        expect(essay24ToScore75(0.5)).toBe(28);
    });

    it("округляет вверх до следующей строки таблицы", () => {
        expect(essay24ToScore75(13.2)).toBe(54);
        expect(essay24ToScore75(0.1)).toBe(28);
    });

    it("держит потолок шкалы", () => {
        expect(essay24ToScore75(24)).toBe(75);
        expect(essay24ToScore75(99)).toBe(75);
    });
});

describe("essayPointsToScore75", () => {
    it("не трогает балл, когда критерий уже 24-балльный", () => {
        expect(essayPointsToScore75(20, 24)).toBe(essay24ToScore75(20));
        expect(essayPointsToScore75(24, 24)).toBe(75);
    });

    it("приводит к 24 баллам, когда максимум за эссе другой", () => {
        // На проде есть моки со старой нормировки, где эссе весит 18.22.
        // Половина работы должна давать тот же балл, что 12 из 24.
        expect(essayPointsToScore75(9.11, 18.22)).toBe(essay24ToScore75(12));
        expect(essayPointsToScore75(18.22, 18.22)).toBe(75);
    });

    it("несданная работа даёт 0", () => {
        expect(essayPointsToScore75(0, 24)).toBe(0);
    });

    it("не падает на бессмысленном максимуме", () => {
        expect(essayPointsToScore75(5, 0)).toBe(0);
        expect(essayPointsToScore75(5, -1)).toBe(0);
    });

    it("зажимает балл выше максимума", () => {
        expect(essayPointsToScore75(30, 24)).toBe(75);
    });
});

describe("combineSectionScores", () => {
    it("берёт среднее арифметическое разделов", () => {
        // Пример из документа: тест и сочинение — два равных раздела.
        expect(combineSectionScores([60, 50])).toBe(55);
    });

    it("тест без сочинения остаётся собой", () => {
        expect(combineSectionScores([62])).toBe(62);
    });

    it("отличает «нечего усреднять» от нуля баллов", () => {
        expect(combineSectionScores([])).toBeNull();
        expect(combineSectionScores([0])).toBe(0);
    });

    it("отбрасывает несчитаемые разделы", () => {
        expect(combineSectionScores([60, NaN])).toBe(60);
    });
});

describe("isNativeCertSubject", () => {
    it("узнаёт предметы из документа", () => {
        // Предмет теста приходит из MOCK_SUBJECTS, предмет группы — из
        // CORE_SUBJECTS ('native'); методика одна и та же.
        for (const subject of ["native", "uzbek", "russian", "karakalpak"]) {
            expect(isNativeCertSubject(subject)).toBe(true);
        }
    });

    it("не захватывает чужие предметы", () => {
        for (const subject of ["english", "math", "history", null, undefined]) {
            expect(isNativeCertSubject(subject)).toBe(false);
        }
    });
});
