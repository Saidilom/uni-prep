import { describe, it, expect } from "vitest";
import { gradeLevelFromScore, levelFloorsFor, pointsToNextLevel, levelsWithinInterval } from "./mock-grade-level";
import { certificateMaxForSubject, tScoreToCertificateExact } from "./certificate-scale";
import { MOCK_SCALE_MAX } from "./rasch";

// ═══ ГЛАВНОЕ СВОЙСТВО ВОЗВРАТА СОТЕННОЙ ШКАЛЫ ═══
//
// Балл показывается из 100 у всех предметов и из 75 у английского, а пороги
// уровней заданы государством на шкале 75. Правка обязана оставить букву
// НЕИЗМЕННОЙ: меняется единица измерения, а не то, что измеряют.
//
// Если этот файл упадёт, значит смена шкалы начала двигать уровни живым
// ученикам — то есть случилось ровно то, чего правка должна была избежать.

const OFFICIAL: Array<[string, number]> = [
    ["A+", 70], ["A", 65], ["B+", 60], ["B", 55], ["C+", 50], ["C", 46],
];

describe("официальные пороги остались нетронутыми на своей шкале", () => {
    it("levelFloorsFor(75) отдаёт ровно числа из документа", () => {
        expect(levelFloorsFor(75)).toEqual(OFFICIAL);
    });

    it("без аргумента — та же шкала 75, что и у модели", () => {
        expect(levelFloorsFor()).toEqual(OFFICIAL);
        expect(MOCK_SCALE_MAX).toBe(75);
    });

    it("на сотне те же пороги растянуты пропорционально", () => {
        const floors = new Map(levelFloorsFor(100));
        expect(floors.get("C")!).toBeCloseTo(61.333, 3);
        expect(floors.get("C+")!).toBeCloseTo(66.667, 3);
        expect(floors.get("B")!).toBeCloseTo(73.333, 3);
        expect(floors.get("B+")!).toBe(80);
        expect(floors.get("A")!).toBeCloseTo(86.667, 3);
        expect(floors.get("A+")!).toBeCloseTo(93.333, 3);
    });

    it("нефизичный максимум не ломает пороги, а откатывает к официальным", () => {
        for (const bad of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(levelFloorsFor(bad)).toEqual(OFFICIAL);
        }
    });
});

describe("буква не зависит от шкалы — это и есть смысл правки", () => {
    // Плотная сетка по всей T-шкале, с шагом мельче десятой, чтобы попасть и
    // ровно в пороги, и в окрестности каждого.
    const tGrid: number[] = [];
    for (let t = 0; t <= 75; t += 0.05) tGrid.push(Number(t.toFixed(2)));
    for (const [, floor] of OFFICIAL) {
        tGrid.push(floor - 0.01, floor, floor + 0.01);
    }

    it("на всей шкале уровень совпадает при 75 и при 100", () => {
        let checked = 0;
        for (const t of tGrid) {
            const onSeventyFive = gradeLevelFromScore(t, { max: 75 });
            const onHundred = gradeLevelFromScore(t / 75 * 100, { max: 100 });
            expect(onHundred).toBe(onSeventyFive);
            checked++;
        }
        expect(checked).toBeGreaterThan(1500);
    });

    it("через настоящий перевод балла — тоже совпадает", () => {
        // Не просто арифметика: идём тем же путём, что роут, через
        // tScoreToCertificateExact и предметный максимум.
        for (const t of tGrid) {
            const english = tScoreToCertificateExact(t, "english");
            const math = tScoreToCertificateExact(t, "math");
            expect(gradeLevelFromScore(math, { max: certificateMaxForSubject("math") }))
                .toBe(gradeLevelFromScore(english, { max: certificateMaxForSubject("english") }));
        }
    });

    it("каждый порог даёт ровно свою букву, а на 0,02 ниже — предыдущую", () => {
        const order = ["below_c", "C", "C+", "B", "B+", "A", "A+"];
        for (const max of [75, 100]) {
            // Порог берётся у самого кода, а не пересчитывается здесь: своя
            // формула в тесте — это второй источник правды, и он разойдётся
            // с первым ровно на границе полосы (проверено: 55/75×75 даёт
            // 54.99999999999999).
            for (const [level, floor] of levelFloorsFor(max)) {
                expect(gradeLevelFromScore(floor, { max })).toBe(level);
                const below = gradeLevelFromScore(floor - 0.02, { max });
                expect(order.indexOf(below)).toBeLessThan(order.indexOf(level));
            }
        }
    });
});

describe("остальные функции уровня тоже знают про шкалу", () => {
    it("«сколько до следующего уровня» растягивается вместе с баллом", () => {
        // T = 48 → до C+ (T = 50) не хватает 2 логит-балла. На сотне тот же
        // разрыв стоит 2.667 балла, а уровень называется тот же.
        const onSeventyFive = pointsToNextLevel(48, { max: 75 })!;
        const onHundred = pointsToNextLevel(48 / 75 * 100, { max: 100 })!;
        expect(onSeventyFive.nextLevel).toBe("C+");
        expect(onHundred.nextLevel).toBe("C+");
        expect(onHundred.pointsNeeded).toBeCloseTo(onSeventyFive.pointsNeeded / 75 * 100, 6);
    });

    it("у A+ следующего уровня нет ни на одной шкале", () => {
        expect(pointsToNextLevel(75, { max: 75 })).toBeNull();
        expect(pointsToNextLevel(100, { max: 100 })).toBeNull();
    });

    it("интервал накрывает те же уровни на обеих шкалах", () => {
        const low = 45, high = 56;   // от «ниже C» до B
        const a = levelsWithinInterval({ low, high }, { max: 75 });
        const b = levelsWithinInterval(
            { low: low / 75 * 100, high: high / 75 * 100 },
            { max: 100 },
        );
        expect(b).toEqual(a);
        expect(a).toEqual(["below_c", "C", "C+", "B"]);
    });
});

describe("максимум по предмету", () => {
    it("английский из 75, остальные из 100", () => {
        expect(certificateMaxForSubject("english")).toBe(75);
        for (const s of ["math", "physics", "chemistry", "biology", "history", "uzbek", "russian", null, undefined]) {
            expect(certificateMaxForSubject(s)).toBe(100);
        }
    });

    it("перевод T в балл упирается в потолок своего предмета", () => {
        expect(tScoreToCertificateExact(75, "english")).toBe(75);
        expect(tScoreToCertificateExact(75, "math")).toBe(100);
        expect(tScoreToCertificateExact(0, "math")).toBe(0);
    });
});
