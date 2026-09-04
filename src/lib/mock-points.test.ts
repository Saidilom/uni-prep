import { describe, expect, it } from "vitest";
import { sumPoints } from "./mock-points";

// Тесты на normalizePointsTo75 удалены вместе с самой функцией: сумма баллов
// теста больше ни к чему не приводится (см. шапку mock-points.ts и раздел
// «Две шкалы 75» в design/FIX.md). Осталось единственное, что здесь считается.
describe("sumPoints", () => {
  it("returns 0 for an empty test", () => {
    expect(sumPoints([])).toBe(0);
  });

  it("adds whole point values", () => {
    expect(sumPoints([1, 1, 2])).toBe(4);
  });

  it("keeps fractional weights exact instead of drifting", () => {
    // Официальные варианты печатают дробные веса ("[2,2 ball]"), и наивное
    // сложение даёт 6.800000000000001 — округление до сотых обязательно.
    expect(sumPoints([2.2, 2.2, 2.4])).toBe(6.8);
  });

  it("stays exact across many fractional items", () => {
    expect(sumPoints(Array(50).fill(1.5))).toBe(75);
  });
});
