import { describe, it, expect } from "vitest";
import { buildScoreTable, lookupScoreRow } from "./score-table";
import { estimateThetaWle } from "./rasch-wle";
import { REFERENCE_DEFAULT } from "./reference-population";
import { raschThetaToT } from "./rasch";
import { tScoreToCertificateExact, formatScore, certificateMaxForSubject} from "./certificate-scale";
import { gradeLevelFromScore } from "./mock-grade-level";

// Реальные сложности бесплатного мока по математике, снятые с прода
// (55 заданий, калибровка 2026-09-06). Взяты, чтобы таблица проверялась на том
// же варианте, по которому выставлялись живые баллы, а не на выдуманном.
const MATH_DIFFICULTY = [
    -2.472587, -2.203947, -1.944562, -1.816085, -1.816085, -1.687331, -1.557500, -1.557500,
    -1.425766, -1.425766, -1.291248, -1.291248, -1.152968, -1.152968, -1.009808, -1.009808,
    -1.009808, -1.009808, -0.860443, -0.860443, -0.703255, -0.536197, -0.536197, -0.536197,
    -0.536197, -0.356582, -0.356582, -0.356582, -0.356582, -0.160746, -0.160746, 0.056563,
    0.056563, 0.303337, 0.303337, 0.303337, 0.303337, 0.592747, 0.592747, 0.592747,
    0.592747, 0.949134, 0.949134, 0.949134, 1.426499, 1.426499, 1.426499, 1.426499,
    1.426499, 2.195624, 3.455711, 3.455711, 3.455711, 3.455711, 3.455711,
];

const table = buildScoreTable(MATH_DIFFICULTY, REFERENCE_DEFAULT, { subjectId: "math" });

describe("форма таблицы (§R.6)", () => {
    it("строк ровно на один больше, чем заданий: от 0 до L включительно", () => {
        expect(table.itemCount).toBe(55);
        expect(table.rows).toHaveLength(56);
        expect(table.rows[0].rawScore).toBe(0);
        expect(table.rows[55].rawScore).toBe(55);
    });

    it("несёт версию оценщика и версию точки отсчёта", () => {
        // §109: без них строку таблицы потом не объяснить и не воспроизвести.
        expect(table.estimator).toContain("WLE");
        expect(table.referenceVersion).toBe(REFERENCE_DEFAULT.version);
    });

    it("балл монотонно растёт по сырому баллу", () => {
        for (let r = 1; r < table.rows.length; r++) {
            expect(table.rows[r].theta).toBeGreaterThan(table.rows[r - 1].theta);
            expect(table.rows[r].score!).toBeGreaterThanOrEqual(table.rows[r - 1].score!);
        }
    });

    it("баллы внутри шкалы и НЕ округлены (§202–203)", () => {
        // В строке лежит точное значение: из него дальше считаются средние и
        // интервалы, и округлять его здесь значило бы округлить в середине
        // цепочки. Одну десятую даёт только показ.
        let anyExact = false;
        for (const row of table.rows) {
            expect(row.score!).toBeGreaterThanOrEqual(0);
            // Таблица считана для математики, значит шкала показа — 100.
            expect(row.score!).toBeLessThanOrEqual(certificateMaxForSubject("math"));
            if (row.score! !== Math.round(row.score! * 100) / 100) anyExact = true;
            // А показанное число — с двумя сотыми (§L.8).
            expect(formatScore(row.score!)).toMatch(/^\d+,\d\d$/);
        }
        expect(anyExact).toBe(true);
    });

    it("уровень в строке согласован с её баллом", () => {
        // Максимум обязателен: балл в строке сотенный, а пороги заданы на 75.
        const max = certificateMaxForSubject("math");
        for (const row of table.rows) {
            expect(row.level).toBe(gradeLevelFromScore(row.score!, { max: max }));
        }
    });
});

// ГЛАВНЫЙ ТЕСТ ШАГА. Таблица не должна ничего менять в измерении: она лишь
// считает то же самое один раз на сырой балл вместо одного раза на ученика.
describe("таблица не меняет ни модель, ни оценку θ", () => {
    it("θ из таблицы совпадает с прямым прогоном WLE до последнего бита", () => {
        for (let raw = 0; raw <= 55; raw++) {
            const direct = estimateThetaWle(
                MATH_DIFFICULTY.map((difficulty, i) => ({ correct: (i < raw ? 1 : 0) as 0 | 1, difficulty })),
            );
            expect(table.rows[raw].theta).toBe(direct.theta);
        }
    });

    it("балл из таблицы совпадает с прямой цепочкой θ → T → балл", () => {
        for (let raw = 0; raw <= 55; raw++) {
            const { mu, sigma } = REFERENCE_DEFAULT;
            const expected = tScoreToCertificateExact(raschThetaToT(table.rows[raw].theta, mu, sigma), "math");
            expect(table.rows[raw].score).toBe(expected);
        }
    });
});

// §B.6 в виде проверки: в уравнение входит только ЧИСЛО верных, а не то, какие
// именно задания решены. Если это когда-нибудь перестанет быть правдой,
// таблица станет неверной — и упадёт здесь, а не на живых баллах.
//
// ВАЖНАЯ ОГОВОРКА про «то же самое». Математически θ у одного сырого балла
// одна, но ПОБИТОВО прямые прогоны могут разойтись на последний бит (~1e-16):
// сумма Σ(x_i − P_i) накапливается в порядке заданий, и от того, какие из них
// помечены верными, меняется порядок сложения вещественных чисел. Ровно это
// видно на проде как разброс θ = 4e-16 внутри группы с одинаковым числом
// верных — не «разные оценки», а погрешность сложения double.
//
// Поэтому таблица не просто дешевле: она делает балл ОДИНАКОВЫМ ПО ПОСТРОЕНИЮ,
// а не «одинаковым с точностью до последнего бита». Проверяем оба уровня:
// θ — с точностью до 1e-12, показанный балл — точным равенством.
describe("θ зависит только от сырого балла (§B.6)", () => {
    const pickTheta = (correctIndexes: number[]) =>
        estimateThetaWle(
            MATH_DIFFICULTY.map((difficulty, i) => ({
                correct: (correctIndexes.includes(i) ? 1 : 0) as 0 | 1,
                difficulty,
            })),
        ).theta;
    const scoreOf = (theta: number) =>
        tScoreToCertificateExact(raschThetaToT(theta, REFERENCE_DEFAULT.mu, REFERENCE_DEFAULT.sigma), "math");

    it("10 самых ЛЁГКИХ и 10 самых ТРУДНЫХ дают одну и ту же θ", () => {
        const easiest = Array.from({ length: 10 }, (_, i) => i);
        const hardest = Array.from({ length: 10 }, (_, i) => 54 - i);
        expect(pickTheta(easiest)).toBeCloseTo(pickTheta(hardest), 12);
        expect(pickTheta(easiest)).toBeCloseTo(table.rows[10].theta, 12);
        // ПОКАЗАННОЕ число обязано совпасть точно — иначе двое с одинаковым
        // числом верных увидели бы разные баллы. Сами точные значения могут
        // разойтись на последний бит (порядок сложения double), поэтому
        // сравнивать надо то, что видит ученик.
        expect(formatScore(scoreOf(pickTheta(hardest)))).toBe(formatScore(table.rows[10].score));
        expect(formatScore(scoreOf(pickTheta(easiest)))).toBe(formatScore(table.rows[10].score));
    });

    it("произвольный разброс из 27 верных даёт ту же θ и тот же балл", () => {
        const scattered = [0, 3, 5, 7, 8, 11, 13, 14, 17, 19, 21, 23, 25, 26, 29, 31, 33, 35, 37, 39, 41, 43, 45, 47, 49, 51, 53];
        expect(scattered).toHaveLength(27);
        expect(pickTheta(scattered)).toBeCloseTo(table.rows[27].theta, 12);
        expect(formatScore(scoreOf(pickTheta(scattered)))).toBe(formatScore(table.rows[27].score));
    });

    it("расхождение прямых прогонов не выходит за погрешность double", () => {
        // Сторож против настоящей ошибки: если однажды θ разойдётся НЕ на
        // последние биты, значит в уравнение попало что-то кроме сырого балла.
        for (const raw of [1, 7, 18, 27, 40, 54]) {
            const first = pickTheta(Array.from({ length: raw }, (_, i) => i));
            const last = pickTheta(Array.from({ length: raw }, (_, i) => 54 - i));
            expect(Math.abs(first - last)).toBeLessThan(1e-9);
        }
    });

    it("а вот РАЗНЫЕ варианты на одном проценте дают разную θ (§B.7)", () => {
        // Обратная сторона: таблицу нельзя переносить с варианта на вариант.
        const easyForm = MATH_DIFFICULTY.map((b) => b - 1.5);
        const easyTable = buildScoreTable(easyForm, REFERENCE_DEFAULT, { subjectId: "math" });
        expect(easyTable.rows[27].theta).not.toBe(table.rows[27].theta);
        // На лёгком варианте те же 27 верных означают меньшую способность.
        expect(easyTable.rows[27].theta).toBeLessThan(table.rows[27].theta);
    });
});

describe("крайние баллы", () => {
    it("нулевой и максимальный сырой балл дают конечную θ (§C.8, §20)", () => {
        expect(Number.isFinite(table.rows[0].theta)).toBe(true);
        expect(Number.isFinite(table.rows[55].theta)).toBe(true);
        expect(table.rows[0].wleStatus).toBe("OK");
        expect(table.rows[55].wleStatus).toBe("OK");
    });

    it("у крайних строк погрешность больше, чем в середине", () => {
        // Там, где заданий по уровню ученика нет, тест почти ничего не мерит.
        const middle = table.rows[27].thetaSe!;
        expect(table.rows[0].thetaSe!).toBeGreaterThan(middle);
        expect(table.rows[55].thetaSe!).toBeGreaterThan(middle);
    });

    it("недостоверные строки помечены статусом, а не спрятаны", () => {
        // §215: балл существует, но доверять ему как точному нельзя.
        const flagged = table.rows.filter((r) => r.measurementStatus !== "OK");
        expect(flagged.length).toBeGreaterThan(0);
        for (const row of flagged) {
            expect(["LOW_INFORMATION", "INSUFFICIENT_INFORMATION"]).toContain(row.measurementStatus);
        }
    });
});

describe("lookupScoreRow", () => {
    it("находит строку по сырому баллу", () => {
        expect(lookupScoreRow(table, 0)!.rawScore).toBe(0);
        expect(lookupScoreRow(table, 27)!.rawScore).toBe(27);
        expect(lookupScoreRow(table, 55)!.rawScore).toBe(55);
    });

    it("на балл вне варианта возвращает null, а не ближайшую строку", () => {
        // §233: подставлять соседнюю строку значило бы молча выдать чужой балл.
        expect(lookupScoreRow(table, -1)).toBeNull();
        expect(lookupScoreRow(table, 56)).toBeNull();
        expect(lookupScoreRow(table, 27.5)).toBeNull();
        expect(lookupScoreRow(table, Number.NaN)).toBeNull();
    });
});

describe("двухраздельный вариант", () => {
    it("оставляет балл и уровень пустыми — их не определить по сырому баллу", () => {
        // У родного языка итог есть среднее двух разделов, и подставлять сюда
        // T первого раздела было бы неверным баллом.
        const withEssay = buildScoreTable(MATH_DIFFICULTY, REFERENCE_DEFAULT, {
            subjectId: "uzbek", hasSecondSection: true,
        });
        for (const row of withEssay.rows) {
            expect(row.score).toBeNull();
            expect(row.level).toBeNull();
            // Но T раздела Раша посчитан — он и пойдёт в усреднение.
            expect(Number.isFinite(row.sectionScore)).toBe(true);
        }
    });
});

describe("детерминизм (§O.4)", () => {
    it("две сборки таблицы дают побитово одинаковые числа", () => {
        const again = buildScoreTable(MATH_DIFFICULTY, REFERENCE_DEFAULT, { subjectId: "math" });
        expect(again.rows.map((r) => r.theta)).toEqual(table.rows.map((r) => r.theta));
        expect(again.rows.map((r) => r.score)).toEqual(table.rows.map((r) => r.score));
    });
});
