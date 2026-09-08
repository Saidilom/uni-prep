import { describe, it, expect } from "vitest";
import { referencePopulationFor, REFERENCE_DEFAULT } from "./reference-population";
import { raschThetaToT } from "./rasch";
import { MOCK_SUBJECTS } from "./mock-import-schema";

// Эталонная популяция — это то, ОТНОСИТЕЛЬНО КОГО считается балл. Раньше μ и σ
// брались из когорты того же теста, и балл ученика зависел от того, кто ещё
// сдавал: средний T всегда выходил ровно 50, а средний балл — 66.67 из 100 при
// любой подготовке. Эти тесты сторожат точку отсчёта: сдвинуть μ значит молча
// сдвинуть все баллы разом.
describe("referencePopulationFor", () => {
    it("точка отсчёта — ноль логит, шаг — одна сигма", () => {
        expect(REFERENCE_DEFAULT.mu).toBe(0);
        expect(REFERENCE_DEFAULT.sigma).toBe(1);
    });

    it("версия проставлена — иначе баллы невоспроизводимы", () => {
        // §109: смена μ или σ обязана менять версию, иначе прошлый балл нельзя
        // ни объяснить, ни пересчитать.
        expect(REFERENCE_DEFAULT.version).toBeTruthy();
    });

    it("один эталон на все предметы", () => {
        // Разные μ по предметам означали бы разные точки отсчёта. Сравнивать
        // балл по математике с баллом по английскому и так нельзя (§118–120), а
        // расхождение точек отсчёта сделало бы это ещё и незаметным.
        for (const subject of MOCK_SUBJECTS) {
            expect(referencePopulationFor(subject)).toEqual(REFERENCE_DEFAULT);
        }
        expect(referencePopulationFor(null)).toEqual(REFERENCE_DEFAULT);
        expect(referencePopulationFor(undefined)).toEqual(REFERENCE_DEFAULT);
    });
});

// Смысл шкалы, закреплённый числами: если кто-то однажды «поправит» μ, эти
// проверки упадут раньше, чем сдвинутся баллы живых учеников.
describe("что означает точка отсчёта", () => {
    const { mu, sigma } = REFERENCE_DEFAULT;

    it("способность вровень со средним заданием даёт ровно 50", () => {
        // recenter() центрирует сложности на нуле, поэтому θ = 0 — это именно
        // «вровень со средним заданием теста», а не произвольная точка.
        expect(raschThetaToT(0, mu, sigma)).toBe(50);
    });

    it("одна логита стоит 10 баллов T", () => {
        expect(raschThetaToT(1, mu, sigma)).toBe(60);
        expect(raschThetaToT(-1, mu, sigma)).toBe(40);
    });

    it("слабый результат больше не подтягивается к середине шкалы", () => {
        // Когорта математики имела θ = −1.836 при 23.3% верных. Прежний
        // механизм давал ей ровно 50 по T (и 66.67 балла), потому что она была
        // сама себе эталоном. Теперь такой θ обязан дать заметно меньше.
        expect(raschThetaToT(-1.836, mu, sigma)).toBeCloseTo(31.64, 2);
        expect(raschThetaToT(-1.836, mu, sigma)).toBeLessThan(40);
    });
});
