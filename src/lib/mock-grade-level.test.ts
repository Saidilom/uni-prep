import { describe, expect, it } from "vitest";
import { gradeLevelDisplay, gradeLevelFromScore, levelsWithinInterval, levelIsBorderline } from "./mock-grade-level";

describe("gradeLevelFromScore", () => {
  it("returns A+ at the top boundary", () => {
    expect(gradeLevelFromScore(70)).toBe("A+");
    expect(gradeLevelFromScore(80)).toBe("A+");
  });

  it("returns each band at its own lower boundary", () => {
    expect(gradeLevelFromScore(65)).toBe("A");
    expect(gradeLevelFromScore(60)).toBe("B+");
    expect(gradeLevelFromScore(55)).toBe("B");
    expect(gradeLevelFromScore(50)).toBe("C+");
    expect(gradeLevelFromScore(46)).toBe("C");
  });

  it("returns below_c just under the C boundary", () => {
    expect(gradeLevelFromScore(45.4)).toBe("below_c");
    expect(gradeLevelFromScore(0)).toBe("below_c");
  });

  // Полоса — интервал, а не точка, к которой округляют. Прежнее правило
  // округляло T до ближайшего целого и на [64.5, 65) выдавало A там, где
  // норма требует B+ (ТЗ §0.3). Тест сторожит, чтобы округление не вернулось:
  // ошибка здесь — это неверный уровень ровно у границы.
  it("не округляет T в полосу — сравнивает точное значение", () => {
    expect(gradeLevelFromScore(64.99)).toBe("B+");
    expect(gradeLevelFromScore(64.79)).toBe("B+");
    expect(gradeLevelFromScore(64.5)).toBe("B+");
    expect(gradeLevelFromScore(45.99)).toBe("below_c");
    expect(gradeLevelFromScore(45.5)).toBe("below_c");
    expect(gradeLevelFromScore(69.99)).toBe("A");
  });

  // Полосы обязаны покрывать шкалу без дыр и без наложений. В таблице ТЗ дыра
  // есть — «> 70» и «65 – 69.9» не покрывают ровно 70.0; здесь верхняя полоса
  // открыта справа, поэтому 70.0 попадает в A+ по построению.
  it("полосы покрывают шкалу без дыр", () => {
    expect(gradeLevelFromScore(70)).toBe("A+");
    const bands: Array<[number, string]> = [
      [45.9999, "below_c"], [46, "C"], [49.9999, "C"], [50, "C+"],
      [54.9999, "C+"], [55, "B"], [59.9999, "B"], [60, "B+"],
      [64.9999, "B+"], [65, "A"], [69.9999, "A"], [70, "A+"],
    ];
    for (const [t, expected] of bands) expect(gradeLevelFromScore(t)).toBe(expected);
  });

  it("нечисловой балл не выдаёт уровень наугад", () => {
    expect(gradeLevelFromScore(Number.NaN)).toBe("below_c");
  });
});

describe("gradeLevelDisplay", () => {
  it("shows letter badges as-is regardless of locale", () => {
    expect(gradeLevelDisplay("A+", "ru")).toBe("A+");
    expect(gradeLevelDisplay("B", "uz")).toBe("B");
  });

  it("localizes below_c", () => {
    expect(gradeLevelDisplay("below_c", "ru")).toBe("Ниже C");
    expect(gradeLevelDisplay("below_c", "uz")).toBe("C dan quyi");
  });
});

// Пограничность уровня (ТЗ L.5). Появилась вместе с погрешностью: при SE
// ±3,2 балла ученик у порога может по-настоящему быть на соседнем уровне, и
// молчать об этом — обещать точность, которой нет.
describe("levelsWithinInterval", () => {
  it("уверенный уровень — один элемент", () => {
    expect(levelsWithinInterval({ low: 30, high: 40 })).toEqual(["below_c"]);
    expect(levelsWithinInterval({ low: 66, high: 68 })).toEqual(["A"]);
  });

  it("интервал через порог отдаёт оба уровня, снизу вверх", () => {
    expect(levelsWithinInterval({ low: 44, high: 48 })).toEqual(["below_c", "C"]);
    expect(levelsWithinInterval({ low: 64, high: 66 })).toEqual(["B+", "A"]);
  });

  it("широкий интервал перечисляет все накрытые уровни без пропусков", () => {
    // Реальный случай с прода: балл 45,2 при SE ±3,2 даёт 39,0–51,4.
    expect(levelsWithinInterval({ low: 39.0, high: 51.4 })).toEqual(["below_c", "C", "C+"]);
    expect(levelsWithinInterval({ low: 0, high: 75 })).toEqual(["below_c", "C", "C+", "B", "B+", "A", "A+"]);
  });

  it("без интервала не судит", () => {
    expect(levelsWithinInterval(null)).toBeNull();
    expect(levelIsBorderline(null)).toBe(false);
  });

  it("пограничность — это «накрыто больше одного уровня»", () => {
    expect(levelIsBorderline({ low: 30, high: 40 })).toBe(false);
    expect(levelIsBorderline({ low: 44, high: 48 })).toBe(true);
  });
});
