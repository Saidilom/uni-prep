import { describe, it, expect } from "vitest";
import { buildPodium, podiumHasWinners } from "./podium";

type S = { name: string; score: number | null };
const podium = (people: S[]) => buildPodium(people, (p) => p.score);
const shape = (people: S[]) =>
    podium(people).map((e) => [e.item.name, e.place, e.medal] as const);

describe("обычный расклад", () => {
    it("три первых получают медали, дальше числа", () => {
        expect(shape([
            { name: "a", score: 70 },
            { name: "b", score: 60 },
            { name: "c", score: 50 },
            { name: "d", score: 40 },
        ])).toEqual([
            ["a", 1, "gold"],
            ["b", 2, "silver"],
            ["c", 3, "bronze"],
            ["d", 4, null],
        ]);
    });

    it("сортирует по убыванию, как бы ни пришли", () => {
        expect(shape([
            { name: "слабый", score: 30 },
            { name: "сильный", score: 75 },
            { name: "средний", score: 50 },
        ]).map((r) => r[0])).toEqual(["сильный", "средний", "слабый"]);
    });

    it("один ученик — золото", () => {
        expect(shape([{ name: "a", score: 12 }])).toEqual([["a", 1, "gold"]]);
    });

    it("пустая группа не роняет расчёт", () => {
        expect(podium([])).toEqual([]);
    });
});

describe("равные баллы делят место, а следующее пропускается", () => {
    it("два золота — дальше сразу бронза, серебра нет", () => {
        // Именно так устроены соревнования. Серебро здесь не пропало по ошибке:
        // назначить его одному из двух равных можно только произволом.
        expect(shape([
            { name: "a", score: 60 },
            { name: "b", score: 60 },
            { name: "c", score: 55 },
        ])).toEqual([
            ["a", 1, "gold"],
            ["b", 1, "gold"],
            ["c", 3, "bronze"],
        ]);
    });

    it("три золота — четвёртый получает четвёртое место, без медали", () => {
        expect(shape([
            { name: "a", score: 60 },
            { name: "b", score: 60 },
            { name: "c", score: 60 },
            { name: "d", score: 10 },
        ])).toEqual([
            ["a", 1, "gold"],
            ["b", 1, "gold"],
            ["c", 1, "gold"],
            ["d", 4, null],
        ]);
    });

    it("равенство на втором месте — два серебра, бронзы нет", () => {
        expect(shape([
            { name: "a", score: 70 },
            { name: "b", score: 50 },
            { name: "c", score: 50 },
            { name: "d", score: 20 },
        ])).toEqual([
            ["a", 1, "gold"],
            ["b", 2, "silver"],
            ["c", 2, "silver"],
            ["d", 4, null],
        ]);
    });

    it("вся группа с одинаковым баллом — все первые", () => {
        expect(shape([
            { name: "a", score: 40 },
            { name: "b", score: 40 },
            { name: "c", score: 40 },
        ]).every((r) => r[1] === 1 && r[2] === "gold")).toBe(true);
    });

    it("при равном балле порядок остаётся входным, а не случайным", () => {
        // Иначе список прыгал бы при каждой перерисовке.
        const people: S[] = [
            { name: "первый в списке", score: 50 },
            { name: "второй в списке", score: 50 },
        ];
        expect(shape(people).map((r) => r[0])).toEqual(["первый в списке", "второй в списке"]);
        expect(shape([...people].reverse()).map((r) => r[0]))
            .toEqual(["второй в списке", "первый в списке"]);
    });
});

describe("кто не сдавал — без места", () => {
    it("уходит в конец и не получает ни медали, ни номера", () => {
        // Последнее место значило бы «проиграл», а он не участвовал.
        expect(shape([
            { name: "не сдавал", score: null },
            { name: "сдавал", score: 30 },
        ])).toEqual([
            ["сдавал", 1, "gold"],
            ["не сдавал", null, null],
        ]);
    });

    it("не сдвигает места сдававших", () => {
        expect(shape([
            { name: "a", score: 70 },
            { name: "нет", score: null },
            { name: "b", score: 60 },
            { name: "нет2", score: null },
            { name: "c", score: 50 },
        ]).filter((r) => r[1] !== null)).toEqual([
            ["a", 1, "gold"],
            ["b", 2, "silver"],
            ["c", 3, "bronze"],
        ]);
    });

    it("нечисловой балл считается отсутствующим, а не нулём", () => {
        const out = shape([{ name: "a", score: Number.NaN }, { name: "b", score: 5 }]);
        expect(out).toEqual([["b", 1, "gold"], ["a", null, null]]);
    });

    it("никто не сдавал — медалей нет вовсе", () => {
        const out = podium([{ name: "a", score: null }, { name: "b", score: null }]);
        expect(podiumHasWinners(out)).toBe(false);
        expect(out.every((e) => e.place === null)).toBe(true);
    });

    it("ноль — это результат, а не отсутствие", () => {
        // Ученик сдал и получил 0: место у него есть.
        expect(shape([{ name: "ноль", score: 0 }])).toEqual([["ноль", 1, "gold"]]);
    });
});

describe("podiumHasWinners", () => {
    it("есть хотя бы один сдававший — есть и победитель", () => {
        expect(podiumHasWinners(podium([{ name: "a", score: 1 }]))).toBe(true);
    });

    it("пустая группа — победителей нет", () => {
        expect(podiumHasWinners(podium([]))).toBe(false);
    });
});
